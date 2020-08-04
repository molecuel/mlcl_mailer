/// <reference types="express-handlebars" />
import nodemailer = require('nodemailer');
declare class mlcl_mailer {
    static loaderversion: number;
    transporter: nodemailer.Transporter;
    transports: any;
    config: any;
    protected viewEngine: Exphbs;
    protected templateEngine: any;
    protected molecuel: any;
    i18n: any;
    constructor(mlcl: any, config: any);
    checkSmtpConfig(config: any): void;
    sendMail(mailoptions: any, callback?: Function): void;
    renderTemplate(templatename: any, data: any, callback: any): void;
    renderHtml(templatename: any, data: any, callback: any): void;
    handlebarCompile(data: any, templatestr: string): string;
    toText(htmlString: any): string;
}
export = mlcl_mailer;
