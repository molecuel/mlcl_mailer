import nodemailer = require('nodemailer');
declare class mlcl_mailer {
    static loaderversion: number;
    transporter: nodemailer.Transporter;
    config: any;
    protected viewEngine: Exphbs;
    protected templateEngine: any;
    protected molecuel: any;
    protected queue: any;
    private stack;
    i18n: any;
    constructor(mlcl: any, config: any);
    sendToQueue(qobject: any, callback?: Function): void;
    checkSmtpConfig(config: any): void;
    sendMail(mailoptions: any, callback?: Function): void;
    registerHandler(handlerfunc: Function): void;
    renderTemplate(templatename: any, data: any, callback: any): void;
    renderHtml(templatename: any, data: any, callback: any): void;
    toText(htmlString: any): string;
    private execHandler(channel, responseobject);
}
export = mlcl_mailer;
