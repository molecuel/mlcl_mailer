'use strict';
import nodemailer = require('nodemailer');
// import fs = require('fs');
// import dkim = require('nodemailer-dkim');
import nodemailerSesTransport = require('nodemailer-ses-transport');
import uuid = require('uuid');
import async = require('async');
import fs = require('fs');
import htmlToText = require('html-to-text');
import handlebars = require('handlebars');
import hbhelpers = require('handlebars-helpers');

class mlcl_mailer {
  public static loaderversion = 2;              // version number
  public transporter: nodemailer.Transporter;   // a nodemailer object
  public transports: any;
  public config: any;                           // configurations mlcl_mailer
  protected viewEngine: Exphbs;                    // View renderer
  protected templateEngine: any;                // Mail templates
  protected molecuel: any;                      // save a copy of parent molecuel
  protected queue: any;                         // rabbit queue
  private stack: Array<Function>;               // custom functions to use as processor in response handling
  public i18n: any;
  public sender: any;
  /**
   * mlcl_mailer constructor listens to queue and process jobs
   * @param mlcl any
   * @param config any
   * @return -
   */
  constructor(mlcl: any, config: any) {
    this.molecuel = mlcl;
    this.transports = {};
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
        let responseQname = 'mlcl__mailer_responseq';
        this.queue.ensureQueue(responseQname, (err) => {
          if(!err) {
            this.queue.client.createReceiver(responseQname).then((receiver) => {
              receiver.on('message', (msg) => {
                this.molecuel.log.debug('mlcl::mailer::queue::response::message:uuid ' + msg.body.data.uuid);
                // Asynchronously process the response queue stack
                // Async 1.4.2 line 125 index.d.ts ( see issue https://github.com/DefinitelyTyped/DefinitelyTyped/issues/8937 )
                let execHandler = this.execHandler(receiver, msg);
                let res = execHandler.next();
                do {
                  try {
                    res = execHandler.next();
                  } catch(e) {
                    this.molecuel.log.error('mlcl::mailer::queue::response::async:error: ' + e);
                  }
                } while (!res.done);
              });
            });
          } else {
            this.molecuel.log.error('mlcl_mailer', err);
          }
        });

        // register send queue with the name given here
        let qname = 'mlcl__mailer_sendq';
        this.queue.ensureQueue(qname, (err) => {
          if(!err) {
            this.queue.client.createSender(responseQname).then((sender) => {
              this.queue.client.createReceiver(qname).then((receiver) => {
                receiver.on('message', (msg) => {
                  let m = msg.body;
                  this.molecuel.log.debug('mlcl::mailer::queue::send:message: ' + msg.body.data.uuid);
                  let msgobject = msg.body;
                  this.sendMail(msgobject, (err, info, mailoptions) => {
                    // delete html/text to not overlarge ServiceBus Passenger
                    delete msgobject.html;
                    delete msgobject.text;
                    // save the state in this object
                    let returnmsgobject;
                    this.molecuel.log.debug('mailer', 'Send mail debug', info);
                    // Catch all err/success and send returnmsgobject to response queue
                    if (err) {
                      returnmsgobject = {
                        status: 'error',
                        data: msgobject,
                        error: err
                      };
                      if(err && err.retryable === false) {
                        receiver.accept(msg);
                      } else {
                        receiver.release(msg);
                      }
                    } else {
                      info.sentTime = new Date();
                      returnmsgobject = {
                        status: 'success',
                        data: msgobject,
                        info: info
                      };
                      receiver.accept(msg);
                    }
                    sender.send(returnmsgobject);
                  });
                });
              });
            });
          } else {
            this.molecuel.log.error('mlcl_mailer', err);
          }
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
      const transport = nodemailer.createTransport(this.config.smtp);
      this.transports.smtp = transport;
    }
    // node-mailer 2.x switch smtp, ses...
    else if (mlcl && mlcl.config && mlcl.config.mail && mlcl.config.mail.enabled) {
      // SMTP
      if (mlcl.config.mail.enabled && mlcl.config.mail.smtp) {
        this.checkSmtpConfig(mlcl.config.mail);
        if (mlcl.config.mail.templateDir) {
          this.config.templateDir = mlcl.config.mail.templateDir;
        }
        const transport = nodemailer.createTransport(this.config.smtp);
        this.transports.smtp = transport;
      }
      // Amazon SES
      if (mlcl.config.mail.enabled && mlcl.config.mail.ses) {
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
        const transport = nodemailer.createTransport(
          nodemailerSesTransport(this.config.ses)
        );
        this.transports.ses = transport;
      }
    }
    if (mlcl.config.mail.default && this.transports[mlcl.config.mail.default]) {
      this.transporter = this.transports[mlcl.config.mail.default];
    } else {
      throw new Error('A default mail transport must be defined');
    }
    this.molecuel.emit('mlcl::mailer::init:post', this);
  }


  protected async createSender(qname: string) {
    if (!this.sender) {
      this.queue.ensureQueue(qname, async function(err) {
        if(err) {
          throw err;
        }
        try {
          this.sender = await this.queue.client.createSender(qname);
        } catch(err) {
          throw err;
        }
      });
    }
  }

  /**
   * mlcl_mailer::sendToQueue(qobject)
   * @brief If a certain threshold of E-Mails is exeeded,
   *        incoming jobs will be forwarded to queue.
   * @param qobject Object containing E-Mail message fields and values
   * @return void
   */
  public async sendToQueue(qobject: any) {
    // mandatory fields are from, to, subject and template
    if (qobject.from && qobject.to && (qobject.subject || qobject.subjectTemplate) && qobject.template) {
      qobject.uuid = uuid.v4();
      //  this.molecuel.log.debug('mailer', 'Sending job object to queue', qobject);
      //  publish task queues with the name given here
      let qname = 'mlcl__mailer_sendq';
      try {
        if (!this.sender) {
          await this.createSender(qname);
        }
        this.sender.send(qobject);
        return qobject;
      } catch(err) {
        this.molecuel.log.error('mailer', 'sendToQueue :: error while sending to queue', err);
        throw err;
      }
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
        let transporter = this.transporter;
        if (mailoptions.transport) {
          transporter = this.transports[mailoptions.transport];
          delete(mailoptions.transport);
        }
        // send mail with defined transport  object
        transporter.sendMail(mailoptions, (error, info) => {
          let returnInfo: any = {};

          if (info && info.messageId && typeof info.messageId === 'string') {
            let split = info.messageId.split('@');
            returnInfo.messageId = split[0];
            returnInfo.messageHost = split[1];
          }

          if (error) {
            this.molecuel.log.error('mailer', 'Error while delivering mail',
              { messageId: returnInfo.messageId, error: error });
            this.molecuel.emit('mlcl::mailer::message:error', this, mailoptions, error);
          } else {
            this.molecuel.log.info('mailer', 'Mail queued',
              { messageId: returnInfo.messageId });
            this.molecuel.emit('mlcl::mailer::message:success', this, mailoptions, info);
          }
          if (callback) {
            callback(error, returnInfo, mailoptions);
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
    hbhelpers({ handlebars: handlebarsinstance });
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
  private * execHandler(receiver, responseobject) {
    try {
      for (let i in this.stack) {
        yield this.stack[i](responseobject);
      }
      receiver.accept(responseobject);
    } catch (err) {
      receiver.release(responseobject);
    }
  }
}

export = mlcl_mailer;
