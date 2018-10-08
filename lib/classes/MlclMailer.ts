'use strict';
import { MlclConfig, MlclCore } from '@molecuel/core';
import { di, injectable } from '@molecuel/di';
import { MlclTheme } from '@molecuel/theme';
import * as fs from 'fs';
import * as htmlToText from 'html-to-text';
import * as i18n from 'i18next';
import * as backend from 'i18next-node-fs-backend';
import * as nodemailer from 'nodemailer';
import * as nodemailerSesTransport from 'nodemailer-ses-transport';
import * as path from 'path';

@injectable
export class MlclMailer {
    public theme: MlclTheme;
    public transporter: nodemailer.Transporter;
    public transports: any = {};
    private config: any;

    constructor() {
        di.bootstrap(MlclCore, MlclConfig, MlclTheme);

        const configHandler: MlclConfig = di.getInstance('MlclConfig');
        this.theme = di.getInstance('MlclTheme');
        this.config = configHandler.getConfig('mail') || configHandler.getConfig('molecuel.mail');
        if (this.config && this.config.enabled) {
            // SMTP
            if (this.config.smtp) {
                // this.checkSmtpConfig(this.config.mail);
                if (this.config.smtp.tlsUnauth) {
                    process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
                }

                if (typeof this.config.smtp !== 'object') {
                    this.config.smtp = {};
                }

                const smtp: any = {};

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
            // Amazon SES
            if (this.config.enabled && this.config.ses) {
                if (this.config.ses.tlsUnauth) {
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
                // SESTransporter
                const transport = nodemailer.createTransport(
                    nodemailerSesTransport(this.config.ses)
                );
                this.transports.ses = transport;
            }
        }
        if (this.config.default && this.transports[this.config.default]) {
            this.transporter = this.transports[this.config.default];
        } else {
            throw new Error('A default mail transport must be defined');
        }
    }

    public async init() {
        i18n.use(backend).init({
            fallbackLng: 'en',
            preload: ['de'],
            backend: {
                loadPath: path.resolve(__dirname, '..', 'locales') + '/{{lng}}/{{ns}}.json',
            }
        });
        // await di.getInstance('MlclClore').init();
        const pathVar = path.resolve(__dirname, '../..' + this.config.templateDir);
        await this.theme.registerTheme(this.config.client, { path: pathVar});
    }

    public async changeLanguage(lang: string): Promise<any> {
        i18n.changeLanguage(lang, (err, res) => {
            return (err ? Promise.reject(err) : Promise.resolve(res));
        });
    }

    public async renderMail(data, template): Promise<{ text, html }> {
        try {
            const html = await this.theme.render(data, { name: this.config.client, file: path.resolve(__dirname, '..', this.config.templateDir, template) });
            const text = htmlToText.fromString(html);
            return Promise.resolve({ text, html });
        } catch (error) {
            return Promise.reject(error);
        }
    }

    public sendMail(mailoptions, callback?: (err, res?, input?) => any): Promise<any> | void {
        const data = mailoptions.data || mailoptions.context;
        data.subject = mailoptions.subject || data.subject;
        this.renderMail(data, mailoptions.template).then(output => {
            mailoptions.text = output.text;
            mailoptions.html = output.html;
            mailoptions.subject = mailoptions.subjectTemplate
              ? mailoptions.subject // todo: compile data based on template w/ handlebar helper, plug in result
              : mailoptions.subject;
            const transporter = this.transports[mailoptions.transport || this.config.default] || this.transporter;
            delete mailoptions.transport;
            transporter.sendMail(mailoptions, (error, info) => {
              const returnInfo: any = {};
              if (info && info.messageId && typeof info.messageId === 'string') {
                returnInfo.messageId = info.messageId.split('@')[0];
                returnInfo.messageHost = info.messageId.split('@')[1];
              }
              // if (error) {} // (retain) separate handling?
              if (callback) {
                callback(error, returnInfo, mailoptions);
              } else {
                return (error ? Promise.reject(error): Promise.resolve(returnInfo));
              }
            });
        }).catch(error => {
            return Promise.reject(error);
        });
    }
}
