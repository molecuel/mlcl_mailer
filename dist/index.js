'use strict';
const nodemailer = require('nodemailer');
const nodemailerSesTransport = require('nodemailer-ses-transport');
const uuid = require('node-uuid');
const async = require('async');
const fs = require('fs');
const htmlToText = require('html-to-text');
const handlebars = require('handlebars');
class mlcl_mailer {
    constructor(mlcl, config) {
        this.molecuel = mlcl;
        mlcl.mailer = this;
        this.molecuel.on('mlcl::i18n::init:post', (i18nmod) => {
            this.i18n = i18nmod;
        });
        this.stack = [];
        this.molecuel.on('mlcl::queue::init:post', (queue) => {
            this.queue = queue;
            if (this.molecuel.serverroles && this.molecuel.serverroles.worker) {
                let responseQname = 'mlcl::mailer:responseq';
                let responseChan = this.queue.getChannel();
                responseChan.then((rch) => {
                    rch.assertQueue(responseQname);
                    rch.prefetch(50);
                    rch.consume(responseQname, (msg) => {
                        let parsed = JSON.parse(msg.content);
                        this.molecuel.log.debug('mlcl::mailer::queue::response::message:uuid ' + parsed.data.uuid);
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
                let qname = 'mlcl::mailer:sendq';
                let chan = this.queue.getChannel();
                chan.then((ch) => {
                    ch.assertQueue(qname);
                    ch.prefetch(50);
                    ch.consume(qname, (msg) => {
                        let m = msg.content.toString();
                        let msgobject = JSON.parse(m);
                        this.sendMail(msgobject, (err, info, mailoptions) => {
                            let returnmsgobject;
                            if (err) {
                                returnmsgobject = {
                                    status: 'error',
                                    data: err
                                };
                                ch.nack(msg);
                            }
                            else {
                                returnmsgobject = {
                                    status: 'success',
                                    data: msgobject
                                };
                                ch.ack(msg);
                            }
                            ch.sendToQueue(responseQname, new Buffer(JSON.stringify(returnmsgobject)));
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
            }
        }
    }
    sendToQueue(qobject, callback) {
        if (qobject.from && qobject.to && qobject.subject && qobject.template) {
            qobject.uuid = uuid.v4();
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
        }
        else {
            this.molecuel.log.warn('mailer', 'sendToQueue :: missing mandatory fields', qobject);
        }
    }
    sendMail(mailoptions, callback) {
        this.renderTemplate(mailoptions.template, mailoptions.data, (err, templatedata) => {
            if (!err) {
                if (templatedata.text) {
                    mailoptions.text = templatedata.text;
                }
                if (templatedata.html) {
                    mailoptions.html = templatedata.html;
                }
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
            else {
                this.molecuel.log.error('mailer', 'Error while rendering template', err);
            }
        });
    }
    registerHandler(handlerfunc) {
        this.stack.push(handlerfunc);
    }
    renderTemplate(templatename, data, callback) {
        this.renderHtml(templatename, data, (err, html) => {
            if (err) {
                callback(err);
            }
            else {
                let templates = {};
                templates.html = html;
                templates.text = this.toText(html);
                callback(null, templates);
            }
        });
    }
    renderHtml(templatename, data, callback) {
        let templateDir = this.molecuel.config.mail.templateDir;
        let handlebarsinstance = handlebars.create();
        fs.readFile(templateDir + '/' + templatename + '.hbs', 'utf8', (err, templatestr) => {
            if (err) {
                callback(err);
            }
            else {
                try {
                    let lang = data.lang;
                    if (!data.lang) {
                        lang = 'en';
                    }
                    let i18n = this.i18n.getLocalizationInstanceForLanguage(lang);
                    handlebarsinstance.registerHelper('translate', function (translatestring) {
                        return i18n.i18next.t(translatestring);
                    });
                    let compiled = handlebarsinstance.compile(templatestr);
                    let htmlstring = compiled(data);
                    callback(null, htmlstring);
                }
                catch (e) {
                    callback(e);
                }
            }
        });
    }
    toText(htmlString) {
        return htmlToText.fromString(htmlString);
    }
    *execHandler(channel, responseobject) {
        try {
            for (let i in this.stack) {
                yield this.stack[i](responseobject);
            }
            channel.ack(responseobject);
        }
        catch (err) {
            channel.nack(responseobject);
        }
    }
}
mlcl_mailer.loaderversion = 2;
module.exports = mlcl_mailer;
