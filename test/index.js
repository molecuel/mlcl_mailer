'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const should = require("should");
const event = require("events");
const i18n = require('mlcl_i18n');
const mailer = require('../src/');
const simplesmtp = require('simplesmtp');
class _mlcl extends event.EventEmitter {
    constructor() {
        super();
    }
}
describe('mlcl_mailer', function () {
    let mlcl;
    let molecuel;
    let uuid1;
    let uuid2;
    before(function (done) {
        this.timeout(5000);
        let server = simplesmtp.createServer();
        server.listen(2500, (err) => {
            if (err) {
                should.not.exist(err);
            }
            else {
                molecuel = new _mlcl();
                molecuel.log = {};
                molecuel.log.info = console.log;
                molecuel.log.error = console.log;
                molecuel.log.debug = console.log;
                molecuel.log.warn = console.log;
                molecuel.serverroles = {};
                molecuel.serverroles.worker = true;
                molecuel.config = {};
                molecuel.config.i18n = {
                    detectLngFromPath: true,
                    languages: {
                        en: {
                            name: 'English',
                            prefix: null,
                            default: true
                        },
                        ru: {
                            name: 'Russian',
                            prefix: 'ru'
                        }
                    },
                    debug: false,
                    backend: {
                        loadPath: __dirname + '/locales/{{lng}}/{{ns}}.json'
                    }
                };
                molecuel.config.mail = {
                    enabled: true,
                    default: 'ses',
                    templateDir: __dirname + '/templates',
                    smtp: {
                        enabled: true,
                        debug: true,
                        host: '127.0.0.1',
                        port: 2501,
                        auth: {
                            user: 'molecuel',
                            pass: 'molecuel'
                        },
                        tlsUnauth: true,
                    },
                    ses: {
                        enabled: true,
                        debug: true,
                        region: 'eu-west-1',
                        accessKeyId: process.env.AWS_SES_ACCESS_KEY_ID,
                        secretAccessKey: process.env.AWS_SES_ACCESS_KEY
                    }
                };
                new mailer(molecuel, {});
                i18n(molecuel);
                molecuel.emit('mlcl::core::init:post', molecuel);
            }
        });
    });
    describe('mailer', function () {
        it('should send a mail', function (done) {
            const mailOptions = {
                from: 'mlcl_mailer Test <ces@sixt-services.de>',
                to: 'sixt@inspirationlabs.com',
                subject: 'Test',
                template: 'email',
                data: {
                    name: 'Myname'
                }
            };
            const successcb = function (mailer, message, info) {
                molecuel.removeListener('mlcl::mailer::message:success', successcb);
                molecuel.removeListener('mlcl::mailer::message:error', failcb);
                done();
            };
            molecuel.on('mlcl::mailer::message:success', successcb);
            const failcb = function (mailer, message, error) {
                molecuel.removeListener('mlcl::mailer::message:success', successcb);
                molecuel.removeListener('mlcl::mailer::message:error', failcb);
                should.not.exist(error);
                done();
            };
            molecuel.on('mlcl::mailer::message:error', failcb);
            molecuel.mailer.sendMail(mailOptions);
        });
        it('should send a mail end return via callback', function (done) {
            const mailOptions = {
                from: 'mlcl_mailer Test <ces@sixt-services.de>',
                to: 'sixt@inspirationlabs.com',
                subject: 'Test',
                template: 'email',
                data: {
                    name: 'Myname'
                },
                transport: 'ses'
            };
            molecuel.mailer.sendMail(mailOptions, function (err, info, data) {
                should.not.exist(err);
                done();
            });
        });
    });
});
//# sourceMappingURL=index.js.map