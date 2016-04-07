'use strict';
import should = require('should');
import assert = require('assert');
import event = require('events');
let mlcl_queue = require('mlcl_queue');
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

    // Legacy config SMTP only
    /*
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
    */

    // Migration mailer 2.x smtp, ses, ...
    molecuel.config.mail = {
      enabled: true,
      default: 'smtp',
      smtp: {
        enabled: true,
        debug: true,
        host: '192.168.99.100',
        tlsUnauth: true,
        auth: {
          user: 'molecuel',
          pass: 'molecuel'
        },
        templateDir: __dirname + '/templates'
      },
      ses: {
        enabled: true,
        debug: true,
        region: 'eu-west-1',
        accessKeyId: 'YOUR_ACCESS_ID',
        secretAccessKey: 'YOUR_SECRET_KEY',
        templateDir: __dirname + '/templates'
      }
    }

    mlcl_queue(molecuel);

    // fake init molecuel
    molecuel.emit('mlcl::core::init:post', molecuel);

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
        from: 'murat.calis@inspirationlabs.com',
        to: 'murat.calis@inspirationlabs.com',
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
        from: 'murat.calis@inspirationlabs.com',
        to: 'murat.calis@inspirationlabs.com',
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
    it('should send to queue', function(done) {
      // setup Qdata with E-Mail options
      let qoptions = {
        from: 'murat.calis@inspirationlabs.com',
        to: 'murat.calis@inspirationlabs.com',
        cc: 'murat.calis@inspirationlabs.com',
        subject: 'Subject',
        template: 'email',
        data: {
          anrede: 'Herr',
          name: 'Hans',
          vorname: 'Meiser'
        },
        options: {
          option1: 'option_value1',
          option2: 'option_value2'
        }
      }

      molecuel.mailer.sendToQ(qoptions, function(error) {
        should.not.exist(error);
      });

      molecuel.mailer.sendToQ(qoptions, function(error) {
        should.not.exist(error);
      });

      molecuel.mailer.sendToQ(qoptions, function(error) {
        should.not.exist(error);
      });

      done();
    });



  });
});
