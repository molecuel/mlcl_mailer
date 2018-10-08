import { MlclTheme } from '@molecuel/theme';
import * as nodemailer from 'nodemailer';
export declare class MlclMailer {
    theme: MlclTheme;
    transporter: nodemailer.Transporter;
    transports: any;
    private config;
    constructor();
    init(): Promise<void>;
    changeLanguage(lang: string): Promise<any>;
    renderMail(data: any, template: any): Promise<{
        text;
        html;
    }>;
    sendMail(mailoptions: any, callback?: (err, res?, input?) => any): Promise<any> | void;
}
