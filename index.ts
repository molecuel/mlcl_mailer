'use strict';
/// <reference path="./typings/node/node.d.ts"/>
/// <reference path="./typings/nodemailer/nodemailer.d.ts"/>
/// <reference path="./typings/nodemailer-dkim/nodemailer-dkim.d.ts"/>
/// <reference path="./typings/nodemailer-smtp-pool/nodemailer-smtp-pool.d.ts"/>

import nodemailer = require('nodemailer');
import fs = require('fs');
import dkim = require('nodemailer-dkim');
import smtpPool = require('nodemailer-smtp-pool');
import expressHandleBars = require('express-handlebars');
import nodemailerExpressHandlebars = require('nodemailer-express-handlebars');
import nodemailerHtmlToText = require('nodemailer-html-to-text');

class mlcl_mailer {
  public static loaderversion = 2;
  public transporter: nodemailer.Transporter;
  public config:any;
  protected viewEngine:any;
  protected templateEngine:any;
  protected molecuel:any;

  constructor(mlcl:any, config:any) {
    this.molecuel = mlcl;
    mlcl.mailer = this;
    if(mlcl && mlcl.config && mlcl.config.smtp && mlcl.config.smtp.enabled) {

      if(mlcl.config.smtp.tlsUnauth) {
        process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
      }
      this.config = {};
      this.config.host = mlcl.config.smtp.host || 'localhost';
      this.config.port = mlcl.config.smtp.port || 25;
      if(mlcl.config.smtp.auth) {
        this.config.auth = mlcl.config.smtp.auth;
      }
      this.config.maxConnections = mlcl.config.smtp.maxConnection|| 5;
      this.config.maxMessages = mlcl.config.smtp.maxMessages|| 100;
      this.config.rateLimit = mlcl.config.smtp.rateLimit ||false;
      this.config.secure =  mlcl.config.smtp.secure || false;
      this.config.debug =  mlcl.config.smtp.debug || false;

      this.transporter = nodemailer.createTransport(
        smtpPool(this.config)
      );

      // init view engine for html mails
      if(mlcl.config.smtp.templateDir) {
        this.viewEngine = expressHandleBars.create({});
        this.templateEngine = nodemailerExpressHandlebars({
            viewEngine: this.viewEngine,
            viewPath: mlcl.config.smtp.templateDir,
            extName: '.hbs'
        });
        this.transporter.use('compile', this.templateEngine);
        if(!mlcl.config.smtp.disableToText) {
          this.transporter.use('compile', nodemailerHtmlToText.htmlToText());
        }
      }
    }
  }

  public sendMail(mailoptions:any, callback?: Function):void{
    // send mail with defined transport  object
    this.transporter.sendMail(mailoptions, (error, info) => {
      if(error){
        var messageid = null;
        if(info && info.messageId) {
          messageid = info.messageId;
        }

        this.molecuel.log.error('mailer', 'Error while delivering mail',
        {messageId: messageid, error: error});
        this.molecuel.emit('mlcl::mailer::message:error', this, mailoptions, error);
      } else {
        this.molecuel.log.info('mailer', 'Mail queued',
        {messageId: info.messageId})
        this.molecuel.emit('mlcl::mailer::message:success', this, mailoptions, info);
      }
      if(callback) {
        callback(error, info, mailoptions);
      }
    });
  }
}

export = mlcl_mailer;
