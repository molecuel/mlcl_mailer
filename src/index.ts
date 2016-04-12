'use strict';
import nodemailer = require('nodemailer');
// import fs = require('fs');
// import dkim = require('nodemailer-dkim');
import expressHandleBars = require('express-handlebars');
import nodemailerExpressHandlebars = require('nodemailer-express-handlebars');
import nodemailerHtmlToText = require('nodemailer-html-to-text');
import nodemailerSesTransport = require('nodemailer-ses-transport');
import uuid = require('node-uuid');
import async = require('async');

class mlcl_mailer {
  public static loaderversion = 2;              // version number
  public transporter: nodemailer.Transporter;   // a nodemailer object
  public config: any;                           // configurations mlcl_mailer
  protected viewEngine: Exphbs;                    // View renderer
  protected templateEngine: any;                // Mail templates
  protected molecuel: any;                      // save a copy of parent molecuel
  protected queue: any;                         // rabbit queue
  private stack: Array<Function>;               // custom functions to use as processor in response handling

  /**
   * mlcl_mailer constructor listens to queue and process jobs
   * @param mlcl any
   * @param config any
   * @return -
   */
  constructor(mlcl: any, config: any) {
    this.molecuel = mlcl;

    mlcl.mailer = this;

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
              let result: boolean = res.done;
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
                  data: err
                };
                // Negative acknowledgement of sendMail
                ch.nack(msg);
              } else {
                returnmsgobject = {
                  status: 'success',
                  data: msgobject
                };
                // Positive acknowledgement of sendMail
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

      if (mlcl.config.smtp.tlsUnauth) {
        process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
      }
      this.config = {};

      this.config.host = mlcl.config.smtp.host || 'localhost';
      this.config.port = mlcl.config.smtp.port || 25;
      if (mlcl.config.smtp.auth) {
        this.config.auth = mlcl.config.smtp.auth;
      }
      this.config.maxConnections = mlcl.config.smtp.maxConnection || 5;
      this.config.maxMessages = mlcl.config.smtp.maxMessages || 100;
      this.config.rateLimit = mlcl.config.smtp.rateLimit || false;
      this.config.secure = mlcl.config.smtp.secure || false;
      this.config.debug = mlcl.config.smtp.debug || false;
      this.config.pool = mlcl.config.smtp.pool || false;

      this.transporter = nodemailer.createTransport(
        this.config
      );

      // init view engine for html mails
      if (mlcl.config.smtp.templateDir) {
        this.viewEngine = expressHandleBars.create({});
        this.templateEngine = nodemailerExpressHandlebars({
          viewEngine: this.viewEngine,
          viewPath: mlcl.config.smtp.templateDir,
          extName: '.hbs'
        });
        this.transporter.use('compile', this.templateEngine);
        if (!mlcl.config.smtp.disableToText) {
          this.transporter.use('compile', nodemailerHtmlToText.htmlToText());
        }
      }
    }

    // node-mailer 2.x switch smtp, ses...
    else if (mlcl && mlcl.config && mlcl.config.mail && mlcl.config.mail.enabled) {
      this.config = {};
      this.config.mail = {};

      // SMTP
      if (mlcl.config.mail.enabled && mlcl.config.mail.smtp && mlcl.config.mail.default === 'smtp') {

        if (mlcl.config.mail.smtp.tlsUnauth) {
          process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
        }
        this.config.mail.smtp = {};

        this.config.mail.smtp.host = mlcl.config.mail.smtp.host || 'localhost';
        this.config.mail.smtp.port = mlcl.config.mail.smtp.port || 25;
        if (mlcl.config.mail.smtp.auth) {
          this.config.mail.smtp.auth = mlcl.config.mail.smtp.auth;
        }
        this.config.mail.smtp.maxConnections = mlcl.config.mail.smtp.maxConnection || 5;
        this.config.mail.smtp.maxMessages = mlcl.config.mail.smtp.maxMessages || 100;
        this.config.mail.smtp.rateLimit = mlcl.config.mail.smtp.rateLimit || false;
        this.config.mail.smtp.secure = mlcl.config.mail.smtp.secure || false;
        this.config.mail.smtp.debug = mlcl.config.mail.smtp.debug || false;
        this.config.mail.smtp.pool = mlcl.config.mail.smtp.pool || false;

        this.transporter = nodemailer.createTransport(
          this.config.mail.smtp
        );

        // init view engine for html mails
        if (mlcl.config.mail.smtp.templateDir) {
          this.viewEngine = expressHandleBars.create({});
          this.templateEngine = nodemailerExpressHandlebars({
            viewEngine: this.viewEngine,
            viewPath: mlcl.config.mail.smtp.templateDir,
            extName: '.hbs'
          });
          this.transporter.use('compile', this.templateEngine);
          if (!mlcl.config.mail.smtp.disableToText) {
            this.transporter.use('compile', nodemailerHtmlToText.htmlToText());
          }
        }
      }
      // Amazon SES
      else if (mlcl.config.mail.enabled && mlcl.config.mail.ses && mlcl.config.mail.default === 'ses') {

        if (mlcl.config.mail.ses.tlsUnauth) {
          process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
        }
        this.config.mail.ses = {};

        this.config.mail.ses.accessKeyId = mlcl.config.mail.ses.accessKeyId;
        this.config.mail.ses.secretAccessKey = mlcl.config.mail.ses.secretAccessKey;
        this.config.mail.ses.rateLimit = mlcl.config.mail.ses.rateLimit || 5;
        this.config.mail.ses.region = mlcl.config.mail.ses.region || 'eu-west-1';

        // SESTransporter
        this.transporter = nodemailer.createTransport(
          nodemailerSesTransport(this.config.mail.ses)
        );

        // init view engine for html mails
        if (mlcl.config.mail.ses.templateDir) {
          this.viewEngine = expressHandleBars.create({});
          this.templateEngine = nodemailerExpressHandlebars({
            viewEngine: this.viewEngine,
            viewPath: mlcl.config.mail.ses.templateDir,
            extName: '.hbs'
          });
          this.transporter.use('compile', this.templateEngine);
          if (!mlcl.config.mail.ses.disableToText) {
            this.transporter.use('compile', nodemailerHtmlToText.htmlToText());
          }
        }
      }
    }
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
    if (qobject.from && qobject.to && qobject.subject && qobject.template) {
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
          console.log('error in sendToQueue');
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

  /**
   * sendMail with nodemailer as SMTP or SES
   * @param mailoptions any
   * @param callback function optional
   * @return void
   */
  public sendMail(mailoptions: any, callback?: Function): void {
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
  }

  /**
   * registerHandler takes custom functions to process a response queue
   * Custom function must have a single parameter which will become a responseobject
   *
   * @param handlerfunc Function
   * @return void
   */
  public registerHandler(handlerfunc: Function): void {
    this.stack.push(handlerfunc);
  }

  /**
   * execHandler Generator function (Iterator) processes a queue
   * @param channel amqplib channel
   * @param responseobject original queue message to ack/nack
   * @return -
   */
  private *execHandler(channel, responseobject) {
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
