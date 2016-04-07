'use strict';
const nodemailer = require('nodemailer');
const expressHandleBars = require('express-handlebars');
const nodemailerExpressHandlebars = require('nodemailer-express-handlebars');
const nodemailerHtmlToText = require('nodemailer-html-to-text');
const nodemailerSesTransport = require('nodemailer-ses-transport');
class mlcl_mailer {
    constructor(mlcl, config) {
        this.molecuel = mlcl;
        mlcl.mailer = this;
        this.molecuel.on('mlcl::queue::init:post', (queue) => {
            this.queue = queue;
            if (this.molecuel.serverroles && this.molecuel.serverroles.worker) {
                let qname = 'mlcl::mailer::sendq';
                let chan = this.queue.getChannel();
                chan.then((ch) => {
                    ch.assertQueue(qname);
                    ch.prefetch(50);
                    ch.consume(qname, (msg) => {
                        let m = msg.content.toString();
                        this.molecuel.log.debug('mlcl::mailer::queue::in::message: ' + m);
                        let msgobject = JSON.parse(m);
                        this.sendMail(msgobject, (err, info, mailoptions) => {
                            if (err) {
                                ch.nack(msg);
                            }
                            else {
                                this.molecuel.log.debug('mlcl::mailer::queue:sent', info);
                                ch.ack(msg);
                            }
                        });
                    });
                }).then(null, function (error) {
                    this.molecuel.log.error('mlcl_mailer', error);
                });
            }
        });
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
        else if (mlcl && mlcl.config && mlcl.config.mail && mlcl.config.mail.enabled) {
            this.config = {};
            this.config.mail = {};
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
                this.transporter = nodemailer.createTransport(this.config.mail.smtp);
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
            else if (mlcl.config.mail.enabled && mlcl.config.mail.ses && mlcl.config.mail.default === 'ses') {
                if (mlcl.config.mail.ses.tlsUnauth) {
                    process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
                }
                this.config.mail.ses = {};
                this.config.mail.ses.accessKeyId = mlcl.config.mail.ses.accessKeyId;
                this.config.mail.ses.secretAccessKey = mlcl.config.mail.ses.secretAccessKey;
                this.config.mail.ses.rateLimit = mlcl.config.mail.ses.rateLimit || 5;
                this.config.mail.ses.region = mlcl.config.mail.ses.region || 'eu-west-1';
                this.transporter = nodemailer.createTransport(nodemailerSesTransport(this.config.mail.ses));
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
    sendToQ(qobject) {
        if (qobject.from && qobject.to && qobject.subject && qobject.template) {
            this.molecuel.log.debug('mailer', 'Sending job object to queue', qobject);
            let qname = 'mlcl::mailer::sendq';
            let chan = this.queue.getChannel();
            chan.then((ch) => {
                ch.assertQueue(qname);
                ch.sendToQueue(qname, new Buffer(JSON.stringify(qobject)));
            }).then(null, (error) => {
                if (error) {
                    this.molecuel.log.error('mailer', 'sendToQ :: error while sending to queue', error);
                }
            });
        }
        else {
            this.molecuel.log.warn('mailer', 'sendToQ :: missing mandatory fields', qobject);
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