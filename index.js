'use strict';
var nodemailer = require('nodemailer');
var smtpPool = require('nodemailer-smtp-pool');
var expressHandleBars = require('express-handlebars');
var nodemailerExpressHandlebars = require('nodemailer-express-handlebars');
var nodemailerHtmlToText = require('nodemailer-html-to-text');
class mlcl_mailer {
    constructor(mlcl, config) {
        this.molecuel = mlcl;
        mlcl.mailer = this;
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
            this.transporter = nodemailer.createTransport(smtpPool(this.config));
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
    }
    sendMail(mailoptions, callback) {
        this.transporter.sendMail(mailoptions, (error, info) => {
            if (error) {
                this.molecuel.log.error('mailer', 'Error while delivering mail', { messageId: info.messageId, error: error });
                this.molecuel.emit('mlcl::mailer::message:error', this, mailoptions, error);
            }
            else {
                this.molecuel.log.info('mailer', 'Mail queued', { messageId: info.messageId });
                this.molecuel.emit('mlcl::mailer::message:success', this, mailoptions, info);
            }
            if (callback) {
                callback(error, info, mailoptions);
            }
        });
    }
}
module.exports = mlcl_mailer;
