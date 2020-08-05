'use strict';
import * as should from 'should';
import assert = require('assert');
import event = require('events');
import { timeout } from 'async';
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
        // console.log('encountered error:');
        // console.log(err);
        should.not.exist(err);
      } else {
        molecuel = new _mlcl();

        // console.log('molecuel instance created');

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
        // console.log('molecuel configs prepared');

        new mailer(molecuel, {});
        // console.log('mailer instance created');
        molecuel.on('mlcl::i18n::init:post', () => {
          molecuel.emit('mlcl::core::init:post', molecuel);
          done();
        });
        i18n(molecuel);

        // fake init molecuel
        // console.log('mlcl core init emitted');

        // console.log(q.bus.host);
        // console.log(q.bus.authenticationProvider);
      }
    });
  });

  describe('mailer', function() {

    it('should send a mail', function(done) {
      // setup e-mail data with unicode symbols
      const mailOptions = {
        from: 'mlcl_mailer Test <ces@sixt-services.de>',
        to: 'sixt@inspirationlabs.com',
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
        from: 'mlcl_mailer Test <ces@sixt-services.de>',
        to: 'sixt@inspirationlabs.com',
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

  });
});
