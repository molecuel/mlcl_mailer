'use strict';
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@molecuel/core");
const di_1 = require("@molecuel/di");
const theme_1 = require("@molecuel/theme");
const htmlToText = require("html-to-text");
const i18n = require("i18next");
const backend = require("i18next-node-fs-backend");
const nodemailer = require("nodemailer");
const nodemailerSesTransport = require("nodemailer-ses-transport");
const path = require("path");
let MlclMailer = class MlclMailer {
    constructor() {
        this.transports = {};
        di_1.di.bootstrap(core_1.MlclCore, core_1.MlclConfig, theme_1.MlclTheme);
        const configHandler = di_1.di.getInstance('MlclConfig');
        this.theme = di_1.di.getInstance('MlclTheme');
        this.config = configHandler.getConfig('mail') || configHandler.getConfig('molecuel.mail');
        if (this.config && this.config.enabled) {
            if (this.config.enabled && this.config.smtp) {
                if (this.config.smtp.tlsUnauth) {
                    process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
                }
                if (typeof this.config.smtp !== 'object') {
                    this.config.smtp = {};
                }
                const smtp = {};
                smtp.host = this.config.smtp.host || 'localhost';
                smtp.port = this.config.smtp.port || 25;
                if (this.config.smtp.auth) {
                    smtp.auth = this.config.smtp.auth;
                }
                smtp.maxConnections = this.config.smtp.maxConnection || 5;
                smtp.maxMessages = this.config.smtp.maxMessages || 100;
                smtp.rateLimit = this.config.smtp.rateLimit || false;
                smtp.secure = this.config.smtp.secure || false;
                smtp.debug = this.config.smtp.debug || false;
                smtp.pool = this.config.smtp.pool || false;
                this.config.smtp = smtp;
                const transport = nodemailer.createTransport(this.config.smtp);
                this.transports.smtp = transport;
            }
            if (this.config.mail.enabled && this.config.mail.ses) {
                if (this.config.mail.ses.tlsUnauth) {
                    process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
                }
                if (!this.config) {
                    this.config = {
                        ses: {}
                    };
                }
                if (typeof this.config.ses !== 'object') {
                    this.config.ses = {};
                }
                this.config.ses.rateLimit = this.config.ses.rateLimit || 5;
                this.config.ses.region = this.config.ses.region || 'eu-west-1';
                const transport = nodemailer.createTransport(nodemailerSesTransport(this.config.ses));
                this.transports.ses = transport;
            }
        }
        if (this.config.default && this.transports[this.config.default]) {
            this.transporter = this.transports[this.config.default];
        }
        else {
            throw new Error('A default mail transport must be defined');
        }
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            i18n.use(backend).init({
                fallbackLng: 'en',
                preload: ['de'],
                backend: {
                    loadPath: path.resolve(__dirname, '..', 'locales') + '/{{lng}}/{{ns}}.json',
                }
            });
            this.theme.registerTheme(this.config.client, { path: path.resolve(__dirname, '..', this.config.templateDir) });
        });
    }
    changeLanguage(lang) {
        return __awaiter(this, void 0, void 0, function* () {
            i18n.changeLanguage(lang, (err, res) => {
                return (err ? Promise.reject(err) : Promise.resolve(res));
            });
        });
    }
    renderMail(data, template) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const html = yield this.theme.render(data, { name: this.config.client, file: path.resolve(__dirname, '..', this.config.templateDir, template) });
                const text = htmlToText.fromString(html);
                return Promise.resolve({ text, html });
            }
            catch (error) {
                return Promise.reject(error);
            }
        });
    }
    sendMail(mailoptions, callback) {
        const data = mailoptions.data || mailoptions.context;
        data.subject = mailoptions.subject || data.subject;
        this.renderMail(data, mailoptions.template).then(output => {
            mailoptions.text = output.text;
            mailoptions.html = output.html;
            mailoptions.subject = mailoptions.subjectTemplate
                ? mailoptions.subject
                : mailoptions.subject;
            const transporter = this.transports[mailoptions.transport || this.config.default] || this.transporter;
            delete mailoptions.transport;
            transporter.sendMail(mailoptions, (error, info) => {
                const returnInfo = {};
                if (info && info.messageId && typeof info.messageId === 'string') {
                    returnInfo.messageId = info.messageId.split('@')[0];
                    returnInfo.messageHost = info.messageId.split('@')[1];
                }
                if (callback) {
                    callback(error, returnInfo, mailoptions);
                }
                else {
                    return (error ? Promise.reject(error) : Promise.resolve(returnInfo));
                }
            });
        }).catch(error => {
            return Promise.reject(error);
        });
    }
};
MlclMailer = __decorate([
    di_1.injectable,
    __metadata("design:paramtypes", [])
], MlclMailer);
exports.MlclMailer = MlclMailer;
//# sourceMappingURL=MlclMailer.js.map