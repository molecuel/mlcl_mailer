import nodemailer = require('nodemailer');
declare class mlcl_mailer {
    static loaderversion: number;
    transporter: nodemailer.Transporter;
    config: any;
    protected viewEngine: any;
    protected templateEngine: any;
    protected molecuel: any;
    constructor(mlcl: any, config: any);
    sendMail(mailoptions: any, callback?: Function): void;
}
export = mlcl_mailer;
