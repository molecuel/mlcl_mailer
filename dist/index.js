'use strict';
const nodemailer = require('nodemailer');
const expressHandleBars = require('express-handlebars');
const nodemailerExpressHandlebars = require('nodemailer-express-handlebars');
const nodemailerHtmlToText = require('nodemailer-html-to-text');
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
            this.config.pool = mlcl.config.smtp.pool || false;
            this.transporter = nodemailer.createTransport(this.config);
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
                let messageid = null;
                if (info && info.messageId) {
                    messageid = info.messageId;
                }
                this.molecuel.log.error('mailer', 'Error while delivering mail', { messageId: messageid, error: error });
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
mlcl_mailer.loaderversion = 2;
module.exports = mlcl_mailer;
