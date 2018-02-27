'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const nodemailer = require("nodemailer");
const nodemailerSesTransport = require("nodemailer-ses-transport");
const uuid = require("uuid");
const fs = require("fs");
const htmlToText = require("html-to-text");
const handlebars = require("handlebars");
const hbhelpers = require("handlebars-helpers");
class mlcl_mailer {
    constructor(mlcl, config) {
        this.molecuel = mlcl;
        this.transports = {};
        mlcl.mailer = this;
        this.molecuel.on('mlcl::i18n::init:post', (i18nmod) => {
            this.i18n = i18nmod;
        });
        this.stack = [];
        this.molecuel.on('mlcl::queue::init:post', (queue) => {
            this.queue = queue;
            if (this.molecuel.serverroles && this.molecuel.serverroles.worker) {
                let responseQname = 'mlcl__mailer_responseq';
                this.queue.ensureQueue(responseQname, (err) => {
                    if (!err) {
                        this.queue.client.createReceiver(responseQname).then((receiver) => {
                            receiver.on('message', (msg) => {
                                this.molecuel.log.debug('mlcl::mailer::queue::response::message:uuid ' + msg.body.data.uuid);
                                let execHandler = this.execHandler(receiver, msg);
                                let res = execHandler.next();
                                do {
                                    try {
                                        res = execHandler.next();
                                    }
                                    catch (e) {
                                        this.molecuel.log.error('mlcl::mailer::queue::response::async:error: ' + e);
                                    }
                                } while (!res.done);
                            });
                        });
                    }
                    else {
                        this.molecuel.log.error('mlcl_mailer', err);
                    }
                });
                let qname = 'mlcl__mailer_sendq';
                this.queue.ensureQueue(qname, (err) => {
                    if (!err) {
                        this.queue.client.createSender(responseQname).then((sender) => {
                            this.queue.client.createReceiver(qname).then((receiver) => {
                                receiver.on('message', (msg) => {
                                    let m = msg.body;
                                    this.molecuel.log.debug('mlcl::mailer::queue::send:message: ' + msg.body.data.uuid);
                                    let msgobject = msg.body;
                                    this.sendMail(msgobject, (err, info, mailoptions) => {
                                        delete msgobject.html;
                                        delete msgobject.text;
                                        let returnmsgobject;
                                        this.molecuel.log.debug('mailer', 'Send mail debug', info);
                                        if (err) {
                                            returnmsgobject = {
                                                status: 'error',
                                                data: msgobject,
                                                error: err
                                            };
                                            if (err && err.retryable === false) {
                                                receiver.accept(msg);
                                            }
                                            else {
                                                receiver.release(msg);
                                            }
                                        }
                                        else {
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
                    }
                    else {
                        this.molecuel.log.error('mlcl_mailer', err);
                    }
                });
            }
        });
        if (mlcl && mlcl.config && mlcl.config.smtp && mlcl.config.smtp.enabled) {
            let config = {};
            config.smtp = mlcl.config.smtp;
            this.checkSmtpConfig(config);
            if (mlcl.config.smtp.templateDir) {
                this.config.templateDir = mlcl.config.smtp.templateDir;
            }
            const transport = nodemailer.createTransport(this.config.smtp);
            this.transports.smtp = transport;
        }
        else if (mlcl && mlcl.config && mlcl.config.mail && mlcl.config.mail.enabled) {
            if (mlcl.config.mail.enabled && mlcl.config.mail.smtp) {
                this.checkSmtpConfig(mlcl.config.mail);
                if (mlcl.config.mail.templateDir) {
                    this.config.templateDir = mlcl.config.mail.templateDir;
                }
                const transport = nodemailer.createTransport(this.config.smtp);
                this.transports.smtp = transport;
            }
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
                const transport = nodemailer.createTransport(nodemailerSesTransport(this.config.ses));
                this.transports.ses = transport;
            }
        }
        if (mlcl.config.mail.default && this.transports[mlcl.config.mail.default]) {
            this.transporter = this.transports[mlcl.config.mail.default];
        }
        else {
            throw new Error('A default mail transport must be defined');
        }
        this.molecuel.emit('mlcl::mailer::init:post', this);
    }
    createSender(qname) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.sender) {
                this.queue.ensureQueue(qname, (err) => __awaiter(this, void 0, void 0, function* () {
                    if (err) {
                        throw err;
                    }
                    try {
                        this.sender = yield this.queue.client.createSender(qname);
                    }
                    catch (err) {
                        throw err;
                    }
                }));
            }
        });
    }
    sendToQueue(qobject) {
        return __awaiter(this, void 0, void 0, function* () {
            if (qobject.from && qobject.to && (qobject.subject || qobject.subjectTemplate) && qobject.template) {
                qobject.uuid = uuid.v4();
                let qname = 'mlcl__mailer_sendq';
                try {
                    if (!this.sender) {
                        yield this.createSender(qname);
                    }
                    this.sender.send(qobject);
                    return qobject;
                }
                catch (err) {
                    this.molecuel.log.error('mailer', 'sendToQueue :: error while sending to queue', err);
                    throw err;
                }
            }
            else {
                this.molecuel.log.warn('mailer', 'sendToQueue :: missing mandatory fields', qobject);
            }
        });
    }
    checkSmtpConfig(config) {
        if (config && config.smtp && config.smtp.tlsUnauth) {
            process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
        }
        if (!this.config) {
            this.config = {
                smtp: {}
            };
        }
        let smtp = {};
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
    sendMail(mailoptions, callback) {
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
                transporter.sendMail(mailoptions, (error, info) => {
                    let returnInfo = {};
                    if (info && info.messageId && typeof info.messageId === 'string') {
                        let split = info.messageId.split('@');
                        returnInfo.messageId = split[0];
                        returnInfo.messageHost = split[1];
                    }
                    if (error) {
                        this.molecuel.log.error('mailer', 'Error while delivering mail', { messageId: returnInfo.messageId, error: error });
                        this.molecuel.emit('mlcl::mailer::message:error', this, mailoptions, error);
                    }
                    else {
                        this.molecuel.log.info('mailer', 'Mail queued', { messageId: returnInfo.messageId });
                        this.molecuel.emit('mlcl::mailer::message:success', this, mailoptions, info);
                    }
                    if (callback) {
                        callback(error, returnInfo, mailoptions);
                    }
                });
            }
            else {
                this.molecuel.log.error('mailer', 'Error while rendering template', err);
            }
        });
    }
    registerHandler(handlerfunc, bindContext) {
        if (bindContext) {
            this.stack.push(handlerfunc.bind(bindContext));
        }
        else {
            this.stack.push(handlerfunc);
        }
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
        let templateDir = this.config.templateDir;
        fs.readFile(templateDir + '/' + templatename + '.hbs', 'utf8', (err, templatestr) => {
            if (err) {
                callback(err);
            }
            else {
                try {
                    let htmlstring = this.handlebarCompile(data, templatestr);
                    callback(null, htmlstring);
                }
                catch (e) {
                    callback(e);
                }
            }
        });
    }
    handlebarCompile(data, templatestr) {
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
    toText(htmlString) {
        return htmlToText.fromString(htmlString);
    }
    *execHandler(receiver, responseobject) {
        try {
            for (let i in this.stack) {
                yield this.stack[i](responseobject);
            }
            receiver.accept(responseobject);
        }
        catch (err) {
            receiver.release(responseobject);
        }
    }
}
mlcl_mailer.loaderversion = 2;
module.exports = mlcl_mailer;
//# sourceMappingURL=index.js.map