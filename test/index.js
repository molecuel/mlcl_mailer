'use strict';
const should = require('should');
const event = require('events');
const mlcl_queue = require('mlcl_queue');
const mlcl_i18n = require('mlcl_i18n');
const mlcl_mailer = require('../dist/');
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
    let i18n;
    before(function (done) {
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
                molecuel.config.queue = {
                    uri: 'amqp://localhost'
                };
                if (process.env.NODE_ENV === 'dockerdev') {
                    molecuel.config.queue = {
                        uri: 'amqp://192.168.99.100'
                    };
                }
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
                    default: 'smtp',
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
                        accessKeyId: 'YOUR_ACCESS_KEY',
                        secretAccessKey: 'YOUR_SECRET_KEY'
                    }
                };
                new mlcl_mailer(molecuel, {});
                mlcl_queue(molecuel);
                mlcl_i18n(molecuel);
                molecuel.emit('mlcl::core::init:post', molecuel);
                done();
            }
        });
    });
    describe('mailer', function () {
        it('should initialize', function (done) {
            let register1 = function (obj) {
            };
            let register2 = function (obj) {
            };
            let register3 = function (obj) {
            };
            molecuel.mailer.registerHandler(register1);
            molecuel.mailer.registerHandler(register2);
            molecuel.mailer.registerHandler(register3);
            done();
        });
        it('should send a mail', function (done) {
            var mailOptions = {
                from: 'dominic.boettger@inspirationlabs.com',
                to: 'dominic.boettger@inspirationlabs.com',
                subject: 'Test',
                template: 'email',
                data: {
                    name: 'Myname'
                }
            };
            var successcb = function (mailer, message, info) {
                molecuel.removeListener('mlcl::mailer::message:success', successcb);
                molecuel.removeListener('mlcl::mailer::message:error', failcb);
                done();
            };
            molecuel.on('mlcl::mailer::message:success', successcb);
            var failcb = function (mailer, message, error) {
                molecuel.removeListener('mlcl::mailer::message:success', successcb);
                molecuel.removeListener('mlcl::mailer::message:error', failcb);
                should.not.exist(error);
                done();
            };
            molecuel.on('mlcl::mailer::message:error', failcb);
            molecuel.mailer.sendMail(mailOptions);
        });
        it('should send a mail end return via callback', function (done) {
            var mailOptions = {
                from: 'dominic.boettger@inspirationlabs.com',
                to: 'dominic.boettger@inspirationlabs.com',
                subject: 'Test',
                template: 'email',
                data: {
                    name: 'Myname'
                }
            };
            molecuel.mailer.sendMail(mailOptions, function (err, info, data) {
                should.not.exist(err);
                done();
            });
        });
        it('should send to queue', function (done) {
            let qoptions = {
                from: 'dominic.boettger@inspirationlabs.com',
                to: 'dominic.boettger@inspirationlabs.com',
                cc: 'dominic.boettger@inspirationlabs.com',
                subject: 'Subject',
                template: 'email',
                data: {
                    anrede: 'Herr',
                    name: 'Doe',
                    vorname: 'Jon'
                },
                options: {
                    option1: 'option_value1',
                    option2: 'option_value2'
                }
            };
            molecuel.mailer.sendToQueue(qoptions, function (error, qobject) {
                should.not.exist(error);
                should.exist(qobject.uuid);
                uuid1 = qobject.uuid;
                done();
            });
        });
        it('should send second mail to queue', function (done) {
            let qoptions = {
                from: 'dominic.boettger@inspirationlabs.com',
                to: 'dominic.boettger@inspirationlabs.com',
                cc: 'dominic.boettger@inspirationlabs.com',
                subject: 'Subject',
                template: 'email',
                data: {
                    anrede: 'Herr',
                    name: 'Doe',
                    vorname: 'Jon'
                },
                options: {
                    option1: 'option_value1',
                    option2: 'option_value2'
                }
            };
            molecuel.mailer.sendToQueue(qoptions, function (error, qobject) {
                should.not.exist(error);
                should.exist(qobject.uuid);
                uuid2 = qobject.uuid;
                done();
            });
        });
        it('should wait to send the message', function (done) {
            setTimeout(() => {
                done();
            }, 1000);
        });
    });
});
