'use strict';
import should = require('should');
import assert = require('assert');
import event = require('events');
let mlcl_mailer = require('../dist/');

class _mlcl extends event.EventEmitter {
  public config: any;
  constructor() {
    super();
  }
}

describe('mlcl_mailer', function() {
  var mlcl;
  var molecuel;

  before(function(done) {

    molecuel = new _mlcl();

    molecuel.log = {};
    molecuel.log.info = console.log;
    molecuel.log.error = console.log;
    molecuel.log.debug = console.log;
    molecuel.log.warn = console.log;

    molecuel.config = {};

    molecuel.config.smtp = {
      enabled: true,
      debug: true,
      host: '192.168.99.100',
      tlsUnauth: true,
      auth: {
        user: 'molecuel',
        pass: 'molecuel'
      },
      templateDir: __dirname + '/templates'
    };

    done();
  });

  describe('mailer', function() {
    it('should initialize', function(done) {
      new mlcl_mailer(molecuel, {});
      done();
    });

    it('should send a mail', function(done) {
      // setup e-mail data with unicode symbols
      var mailOptions = {
        from: 'from@domain.com',
        to: 'to@domain.com',
        subject: 'Test',
        template: 'email',
        context: {
          name: 'Myname'
        }
      }

      var successcb = function(mailer, message, info) {
        molecuel.removeListener('mlcl::mailer::message:success', successcb);
        molecuel.removeListener('mlcl::mailer::message:error', failcb);
        done();
      };

      molecuel.on('mlcl::mailer::message:success', successcb);

      var failcb = function(mailer, message, error) {
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
      var mailOptions = {
        from: 'from@domain.com',
        to: 'to@domain.com',
        subject: 'Test',
        template: 'email',
        context: {
          name: 'Myname'
        }
      }

      molecuel.mailer.sendMail(mailOptions, function(err, info, data) {
        should.not.exist(err);
        done();
      });
    });
  });
});
