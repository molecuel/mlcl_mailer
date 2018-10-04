'use strict';
import * as should from 'should';
import assert = require('assert');
import event = require('events');
import { timeout } from 'async';
const mlclQueue = require('mlcl_queue');
const i18n = require('mlcl_i18n');
const mailer = require('../src/');
const simplesmtp = require('simplesmtp');

class _mlcl extends event.EventEmitter {
  public config: any;
  constructor() {
    super();
  }
}

describe('mlcl_mailer', function() {
  let mlcl;
  let molecuel;
  let uuid1;
  let uuid2;

  before(function(done) {
    this.timeout(5000);
    let server = simplesmtp.createServer();
    server.listen(2500, (err) => {
      if (err) {
        should.not.exist(err);
      } else {
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

        // Migration mailer 2.x smtp, ses, ...
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

        mlclQueue(molecuel);
        i18n(molecuel);

        // fake init molecuel
        molecuel.emit('mlcl::core::init:post', molecuel);
        // wait until queue is being setup
        molecuel.on('mlcl::queue::init:post', (queue) => {
          done();
        });
      }
    });
  });

  describe('mailer', function() {
    it('should initialize', function(done) {
      this.timeout(10000);
      let register1 = function(obj) {
      };

      let register2 = function(obj) {
      };

      let register3 = function(obj) {
      };

      molecuel.mailer.registerHandler(register1);
      molecuel.mailer.registerHandler(register2);
      molecuel.mailer.registerHandler(register3);

      setTimeout(() => {
        done();
      }, 2000);
    });

    it('should send a mail', function(done) {
      // setup e-mail data with unicode symbols
      const mailOptions = {
        from: 'dominic.boettger@inspirationlabs.com',
        to: 'daniel.walther@inspirationlabs.com',
        subject: 'Test',
        template: 'email',
        data: {
          name: 'Myname'
        }
      };

      const successcb = function(mailer, message, info) {
        molecuel.removeListener('mlcl::mailer::message:success', successcb);
        molecuel.removeListener('mlcl::mailer::message:error', failcb);
        done();
      };

      molecuel.on('mlcl::mailer::message:success', successcb);

      const failcb = function(mailer, message, error) {
        molecuel.removeListener('mlcl::mailer::message:success', successcb);
        molecuel.removeListener('mlcl::mailer::message:error', failcb);
        should.not.exist(error);
        done();
      };

      molecuel.on('mlcl::mailer::message:error', failcb);
      molecuel.mailer.sendMail(mailOptions);
    });

    it('should send a mail end return via callback', function(done) {
      // setup e-mail data with unicode symbols
      const mailOptions = {
        from: 'dominic.boettger@inspirationlabs.com',
        to: 'daniel.walther@inspirationlabs.com',
        subject: 'Test',
        template: 'email',
        data: {
          name: 'Myname'
        },
        transport: 'ses'
      };

      molecuel.mailer.sendMail(mailOptions, function(err, info, data) {
        should.not.exist(err);
        done();
      });
    });

    it('should send to queue', function(done) {
      // setup Qdata with E-Mail options
      let qoptions = {
        from: 'dominic.boettger@inspirationlabs.com',
        to: 'daniel.walther@inspirationlabs.com',
        // cc: 'dominic.boettger@inspirationlabs.com',
        subject: 'Subject first mail',
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

      molecuel.mailer.sendToQueue(qoptions, function(error, qobject) {
        should.not.exist(error);
        should.exist(qobject.uuid);
        uuid1 = qobject.uuid;
        done();
      });
    });

    it('should send second mail to queue', function(done) {
      // setup Qdata with E-Mail options
      let qoptions = {
        from: 'dominic.boettger@inspirationlabs.com',
        to: 'daniel.walther@inspirationlabs.com',
        // cc: 'dominic.boettger@inspirationlabs.com',
        subject: 'Subject second mail',
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

      molecuel.mailer.sendToQueue(qoptions, function(error, qobject) {
        should.not.exist(error);
        should.exist(qobject.uuid);
        uuid2 = qobject.uuid;
        done();
      });
    });

    it('should wait to send the message', function(done) {
      this.timeout(4000);
      setTimeout(() => {
        done();
      }, 3000);
    });
  });
});
