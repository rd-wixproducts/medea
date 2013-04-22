var fs = require('fs');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var constants = require('./constants');
var KeyDirEntry = require('./keydir_entry');
var sizes = constants.sizes;

var DataFileParser = module.exports = function(filename) {
  this.filename = filename;
};
util.inherhits(DataFileParser, EventEmitter);

DataFileParser.parse = function(filename, cb) {
  var parser = new DataFileParser(filename);
  parser.on('entry', cb);
};

DataFileParser.prototype.parse = function() {
  var self = this;
  var stream = fs.createReadStream(this.filename);

  stream.on('error', function(err) {
    self.emit('error', err);
  });

  stream.on('end', function() {
    self.emit('end');
  });

  var waiting = new Buffer(0);
  var curlen = 0;
  var lastHeaderBuf;
  var lastKeyLen = 01;
  var state = 'findingHeader';

  stream.on('data', function(err, data) {
    stream.pause();

  });
};

var iterator = function(dirname, keydir, hintFiles, i, max, cb1) {
  var current = hintFiles[i];

  var stream = fs.createReadStream(current);

  var waiting = new Buffer(0);
  var curlen = 0;
  var lastHeaderBuf;
  var lastKeyLen = -1;
  var state = 'findingHeader';

  stream.on('data', function(chunk) {
    stream.pause();

    curlen = chunk.length;

    if (waiting.length) {
      if (!chunk) {
        chunk = new Buffer(0);
      }
      chunk = Buffer.concat([waiting, chunk]);
      curlen = chunk.length;
      waiting = new Buffer(0);
    }

    while (curlen) {
      if (curlen < sizes.crc && state === 'keyFound') {
        waiting = chunk;
        chunk = new Buffer(0);
        curlen = 0;
        stream.resume();
        return;
      }

      if (curlen > sizes.crc && state === 'keyFound') {
        state = 'findingHeader';
      }


      if (curlen < hintHeaderSize && curlen > sizes.crc && (state === 'findingHeader')) {
        waiting = chunk;
        chunk = new Buffer(0);
        curlen = 0;
        state = 'findingHeader';
        stream.resume();
        return;
      }

      if (state === 'headerFound' && lastKeyLen > -1 && curlen < lastKeyLen) {
        waiting = chunk;
        chunk = new Buffer(0);
        curlen = 0;
        stream.resume();
        return;
      }

      if (curlen >= hintHeaderSize && state === 'findingHeader') {
        var headerBuf = chunk.slice(0, hintHeaderSize);

        var keylen = headerBuf.readUInt16BE(sizes.timestamp);
        lastKeyLen = keylen;
        lastHeaderBuf = headerBuf;

        chunk = chunk.slice(headerBuf.length);
        waiting = new Buffer(0);
        curlen = chunk.length;

        state = 'headerFound';
      } else if (curlen >= lastKeyLen && state === 'headerFound') {
        var keyBuf = chunk.slice(0, lastKeyLen);

        var key = keyBuf.toString();

        var fileId = Number(current.replace(dirname + '/', '').replace('.medea.hint', ''));
        if (!keydir[key] || (keydir[key] && keydir[key].fileId === fileId)) {
          var entry = new KeyDirEntry();
          entry.key = key;
          entry.fileId = fileId;
          entry.timestamp = lastHeaderBuf.readDoubleBE(0);
          entry.valueSize = lastHeaderBuf.readUInt32BE(sizes.timestamp + sizes.keysize) - key.length - sizes.header;
          entry.valuePosition = lastHeaderBuf.readDoubleBE(sizes.timestamp + sizes.keysize + sizes.totalsize) + sizes.header + key.length;
          keydir[key] = entry;
        }

        chunk = chunk.slice(lastKeyLen);
        curlen = chunk.length;
        lastKeyLen = -1;
        lastHeaderBuf = null;

        state = 'keyFound';
      } else if (curlen === sizes.crc && (state === 'keyFound')) {
        waiting = chunk;
        chunk = new Buffer(0);
        curlen = 0;
      } else {
        if (state === 'keyFound') {
          state = 'findingHeader';
        } else {
          waiting = chunk;
          chunk = new Buffer(0);
          curlen = 0;
        }
      }
    }

    stream.resume();
  });
  
  stream.on('end', function() {
    if (i === max) {
      cb1();
    } else {
      iterator(dirname, keydir, hintFiles, i+1, max, cb1);
    }
  });
};
