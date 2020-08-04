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
  public i18n: any;
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

    // node-mailer migration 2.x backward compatibility if smtp is configured in legacy mode
    // Legacy object is mlcl.config.smtp, new object is mlcl.config.mail.smtp
    if (mlcl && mlcl.config && mlcl.config.smtp && mlcl.config.smtp.enabled) {
      let mlclConfig: any = {};
      mlclConfig.smtp = mlcl.config.smtp;
      this.checkSmtpConfig(mlclConfig);
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
          delete (mailoptions.transport);
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
      handlebarsinstance.registerHelper('translate', function (translatestring) {
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

}

export = mlcl_mailer;
