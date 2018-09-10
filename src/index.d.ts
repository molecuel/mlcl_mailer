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
    protected queue: any;
    private stack;
    i18n: any;
    sender: any;
    constructor(mlcl: any, config: any);
    protected createSender(qname: string, callback: any): void;
    sendToQueue(qobject: any, callback?: Function): void;
    checkSmtpConfig(config: any): void;
    sendMail(mailoptions: any, callback?: Function): void;
    registerHandler(handlerfunc: Function, bindContext: any): void;
    renderTemplate(templatename: any, data: any, callback: any): void;
    renderHtml(templatename: any, data: any, callback: any): void;
    handlebarCompile(data: any, templatestr: string): string;
    toText(htmlString: any): string;
    private execHandler;
}
export = mlcl_mailer;
