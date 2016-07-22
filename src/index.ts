'use strict';
import nodemailer = require('nodemailer');
// import fs = require('fs');
// import dkim = require('nodemailer-dkim');
import nodemailerSesTransport = require('nodemailer-ses-transport');
import uuid = require('node-uuid');
import async = require('async');
import fs = require('fs');
import htmlToText = require('html-to-text');
import handlebars = require('handlebars');

require('handlebars-helpers')({
  handlebars: handlebars
});

class mlcl_mailer {
  public static loaderversion = 2;              // version number
  public transporter: nodemailer.Transporter;   // a nodemailer object
  public config: any;                           // configurations mlcl_mailer
  protected viewEngine: Exphbs;                    // View renderer
  protected templateEngine: any;                // Mail templates
  protected molecuel: any;                      // save a copy of parent molecuel
  protected queue: any;                         // rabbit queue
  private stack: Array<Function>;               // custom functions to use as processor in response handling
  public i18n: any;

  /**
   * mlcl_mailer constructor listens to queue and process jobs
   * @param mlcl any
   * @param config any
   * @return -
   */
  constructor(mlcl: any, config: any) {
    this.molecuel = mlcl;

    mlcl.mailer = this;

    this.molecuel.on('mlcl::i18n::init:post', (i18nmod) => {
      this.i18n = i18nmod;
    });

    // API custom functions to handle response queue messages
    this.stack = [];

    // Register with RabbitMQ queue jobs
    this.molecuel.on('mlcl::queue::init:post', (queue) => {
      this.queue = queue;

      // Worker mode ( see docker run string )
      if (this.molecuel.serverroles && this.molecuel.serverroles.worker) {

        // register response queue with the name given here
        let responseQname = 'mlcl::mailer:responseq';
        let responseChan = this.queue.getChannel();
        responseChan.then((rch) => {
          rch.assertQueue(responseQname);
          rch.prefetch(50);
          rch.consume(responseQname, (msg) => {
            let parsed = JSON.parse(msg.content);
            this.molecuel.log.debug('mlcl::mailer::queue::response::message:uuid ' + parsed.data.uuid);

            // Asynchronously process the response queue stack
            // Async 1.4.2 line 125 index.d.ts ( see issue https://github.com/DefinitelyTyped/DefinitelyTyped/issues/8937 )
            let execHandler = this.execHandler(rch, msg);
            async.doWhilst((callback) => {
              let res = execHandler.next();
              callback(null, res);
            }, (res) => {
              return !res.done;
            }, (err) => {
              if (err) {
                this.molecuel.log.error('mlcl::mailer::queue::response::async:error: ' + err);
              }
            });
          });
        });

        // register send queue with the name given here
        let qname = 'mlcl::mailer:sendq';
        let chan = this.queue.getChannel();
        chan.then((ch) => {
          ch.assertQueue(qname);
          ch.prefetch(50);
          ch.consume(qname, (msg) => {
            let m = msg.content.toString();

            //  this.molecuel.log.debug('mlcl::mailer::queue::send:message: ' + m);
            let msgobject = JSON.parse(m);

            this.sendMail(msgobject, (err, info, mailoptions) => {
              // save the state in this object
              let returnmsgobject;

              // Catch all err/success and send returnmsgobject to response queue
              if (err) {
                returnmsgobject = {
                  status: 'error',
                  data: msgobject,
                  error: err
                };
                ch.nack(msg);
              } else {
                info.sentTime = new Date();
                returnmsgobject = {
                  status: 'success',
                  data: msgobject,
                  info: info
                };
                ch.ack(msg);
              }
              ch.sendToQueue(responseQname, new Buffer(JSON.stringify(returnmsgobject)));
            });
          });
        }).then(null, function(error) {
          this.molecuel.log.error('mlcl_mailer', error);
        });
      }
    });

    // node-mailer migration 2.x backward compatibility if smtp is configured in legacy mode
    // Legacy object is mlcl.config.smtp, new object is mlcl.config.mail.smtp
    if (mlcl && mlcl.config && mlcl.config.smtp && mlcl.config.smtp.enabled) {
      let config: any = {};
      config.smtp = mlcl.config.smtp;
      this.checkSmtpConfig(config);
      if (mlcl.config.smtp.templateDir) {
        this.config.templateDir = mlcl.config.smtp.templateDir;
      }
      this.transporter = nodemailer.createTransport(this.config.smtp);
    }
    // node-mailer 2.x switch smtp, ses...
    else if (mlcl && mlcl.config && mlcl.config.mail && mlcl.config.mail.enabled) {
      // SMTP
      if (mlcl.config.mail.enabled && mlcl.config.mail.smtp && mlcl.config.mail.default === 'smtp') {
        this.checkSmtpConfig(mlcl.config.mail);
        if (mlcl.config.mail.templateDir) {
          this.config.templateDir = mlcl.config.mail.templateDir;
        }
        this.transporter = nodemailer.createTransport(this.config.smtp);
      }
      // Amazon SES
      else if (mlcl.config.mail.enabled && mlcl.config.mail.ses && mlcl.config.mail.default === 'ses') {
        if (mlcl.config.mail.ses.tlsUnauth) {
          process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
        }
        if (!this.config) {
          this.config = {
            ses: {}
          };
        }
        this.config.ses = {};
        if (mlcl.config.mail.templateDir) {
          this.config.templateDir = mlcl.config.mail.templateDir;
        }
        this.config.ses.accessKeyId = mlcl.config.mail.ses.accessKeyId;
        this.config.ses.secretAccessKey = mlcl.config.mail.ses.secretAccessKey;
        this.config.ses.rateLimit = mlcl.config.mail.ses.rateLimit || 5;
        this.config.ses.region = mlcl.config.mail.ses.region || 'eu-west-1';

        // SESTransporter
        this.transporter = nodemailer.createTransport(
          nodemailerSesTransport(this.config.ses)
        );
      }
    }
    this.molecuel.emit('mlcl::mailer::init:post', this);
  }

  /**
   * mlcl_mailer::sendToQueue(qobject)
   * @brief If a certain threshold of E-Mails is exeeded,
   *        incoming jobs will be forwarded to queue.
   * @param qobject Object containing E-Mail message fields and values
   * @return void
   */
  public sendToQueue(qobject: any, callback?: Function): void {
    // mandatory fields are from, to, subject and template
    if (qobject.from && qobject.to && (qobject.subject || qobject.subjectTemplate) && qobject.template) {
      qobject.uuid = uuid.v4();
      //  this.molecuel.log.debug('mailer', 'Sending job object to queue', qobject);
      //  publish task queues with the name given here
      let qname = 'mlcl::mailer:sendq';
      let chan = this.queue.getChannel();
      chan.then((ch) => {
        ch.assertQueue(qname);
        ch.sendToQueue(qname, new Buffer(JSON.stringify(qobject)));
        if (callback) {
          callback(null, qobject);
        }
      })
        .then(null, (error) => {
          if (error) {
            this.molecuel.log.error('mailer', 'sendToQueue :: error while sending to queue', error);
          }
          if (callback) {
            callback(error, qobject);
          }
        });
    } else {
      this.molecuel.log.warn('mailer', 'sendToQueue :: missing mandatory fields', qobject);
    }
  }

  public checkSmtpConfig(config: any) {
    if (config && config.smtp && config.smtp.tlsUnauth) {
      process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
    }

    if (!this.config) {
      this.config = {
        smtp: {}
      };
    }

    let smtp: any = {};

    smtp.host = config.smtp.host || 'localhost';
    smtp.port = config.smtp.port || 25;
    if (config.smtp.auth) {
      smtp.auth = config.smtp.auth;
    }
    smtp.maxConnections = config.smtp.maxConnection || 5;
    smtp.maxMessages = config.smtp.maxMessages || 100;
    smtp.rateLimit = config.smtp.rateLimit || false;
    smtp.secure = config.smtp.secure || false;
    smtp.debug = config.smtp.debug || false;
    smtp.pool = config.smtp.pool || false;

    this.config.smtp = smtp;
  }

  /**
   * sendMail with nodemailer as SMTP or SES
   * @param mailoptions any
   * @param callback function optional
   * @return void
   */
  public sendMail(mailoptions: any, callback?: Function): void {
    let data = mailoptions.context;
    if (mailoptions.data) {
      data = mailoptions.data;
    }
    if (mailoptions.subject) {
      data.subject = mailoptions.subject;
    }
    this.renderTemplate(mailoptions.template, data, (err, templatedata) => {
      if (!err) {
        if (templatedata.text) {
          mailoptions.text = templatedata.text;
        }
        if (templatedata.html) {
          mailoptions.html = templatedata.html;
        }
        if (mailoptions.subjectTemplate) {
          mailoptions.subject = this.handlebarCompile(data, mailoptions.subjectTemplate);
        }
        // send mail with defined transport  object
        this.transporter.sendMail(mailoptions, (error, info) => {
          if (error) {
            let messageid = null;
            if (info && info.messageId) {
              messageid = info.messageId;
            }
            this.molecuel.log.error('mailer', 'Error while delivering mail',
              { messageId: messageid, error: error });
            this.molecuel.emit('mlcl::mailer::message:error', this, mailoptions, error);
          } else {
            this.molecuel.log.info('mailer', 'Mail queued',
              { messageId: info.messageId });
            this.molecuel.emit('mlcl::mailer::message:success', this, mailoptions, info);
          }
          if (callback) {
            callback(error, info, mailoptions);
          }
        });
      } else {
        this.molecuel.log.error('mailer', 'Error while rendering template', err);
      }
    });
  }

  /**
   * registerHandler takes custom functions to process a response queue
   * Custom function must have a single parameter which will become a responseobject
   *
   * @param handlerfunc Function
   * @return void
   */
  public registerHandler(handlerfunc: Function, bindContext: any): void {
    if (bindContext) {
      this.stack.push(handlerfunc.bind(bindContext));
    } else {
      this.stack.push(handlerfunc);
    }
  }


  public renderTemplate(templatename, data, callback) {
    this.renderHtml(templatename, data, (err, html) => {
      if (err) {
        callback(err);
      } else {
        let templates: any = {};
        templates.html = html;
        templates.text = this.toText(html);
        callback(null, templates);
      }
    });
  }

  /**
   * [renderTemplate description]
   * @param  {[type]} templatename [description]
   * @param  {[type]} data         [description]
   * @return {String}              [description]
   */
  public renderHtml(templatename, data, callback): void {
    let templateDir = this.config.templateDir;

    fs.readFile(templateDir + '/' + templatename + '.hbs', 'utf8', (err, templatestr) => {
      if (err) {
        callback(err);
      } else {
        try {
          let htmlstring = this.handlebarCompile(data, templatestr);
          callback(null, htmlstring);
        } catch (e) {
          callback(e);
        }
      }
    });
  }

  public handlebarCompile(data, templatestr: string): string {
    let handlebarsinstance = handlebars.create();
    let lang = data.lang;
    if (!data.lang) {
      lang = 'en';
    }
    if (this.i18n) {
      let i18n = this.i18n.getLocalizationInstanceForLanguage(lang);
      let translate = i18n.i18next.getFixedT(lang);
      handlebarsinstance.registerHelper('translate', function(translatestring) {
        let translation = translate(translatestring, data);
        return translation;
      });
    }
    let compiled = handlebarsinstance.compile(templatestr);
    let htmlstring = compiled(data);

    return htmlstring;
  }

  public toText(htmlString) {
    return htmlToText.fromString(htmlString);
  }

  /**
   * execHandler Generator function (Iterator) processes a queue
   * @param channel amqplib channel
   * @param responseobject original queue message to ack/nack
   * @return -
   */
  private * execHandler(channel, responseobject) {
    try {
      for (let i in this.stack) {
        yield this.stack[i](responseobject);
      }
      channel.ack(responseobject);
    } catch (err) {
      channel.nack(responseobject);
    }
  }
}

export = mlcl_mailer;
