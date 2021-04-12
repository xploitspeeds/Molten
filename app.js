const https = require('https'), 
    http = require('http'),
    WebSocket = require('ws'),
    wrtc = require('wrtc'),
    zlib = require('zlib'), 
    url = require('url'), 
    Rewriter = require('./rewriter');

module.exports = class {
    constructor(passthrough = {}) {
        this.prefix = passthrough.prefix;

        Object.assign(globalThis, this);
    };

    http(req, resp) {
        try {
            this.baseUrl = new URL((req.connection.encrypted ? 'https' : !req.connection.encrypted ? 'http' : null) + '://' + req.headers.host),
            this.clientUrl = new URL(req.url.slice(this.prefix.length));
        } catch (err) {
            if (typeof err == TypeError) return req.writeHead(500, { 'content-type': 'text/plain' })
                .end(err);
        }

        const rewriter = new Rewriter({
                prefix: this.prefix,
                baseUrl: this.baseUrl, 
                clientUrl: this.clientUrl
            }), 
            client = https.request(
                this.clientUrl.href,
                { 
                    headers: Object.entries(req.headers).map(([header, directives]) => rewriter.header([header, directives])).filter(map => map),
                    method: req.method,
                    followAllRedirects: false 
                }, 
                (clientResp, streamData = [], sendData = '') => clientResp.on('data', data => streamData.push(data))
                    .on('end', () => {
                        const enc = clientResp.headers['content-encoding'],
                            type = clientResp.headers['content-type'];

                        typeof enc != 'undefined' ? enc.split`; `[0].split`, `.forEach(encType => 
                            sendData = encType == 'gzip' ? 
                            zlib.gunzipSync(Buffer.concat(streamData)).toString() : 
                            encType == 'deflate' ? zlib.inflateSync(Buffer.concat(streamData)).toString() : 
                            encType == 'br' ? zlib.brotliDecompressSync(Buffer.concat(streamData)).toString() : 
                            null 
                        ) :
                        sendData = Buffer.concat(streamData).toString();

                        if (typeof type != 'undefined') {
                            const directive = type.split`;`[0];

                            sendData = directive == 'text/html' ? rewriter.html(sendData) : 
                            directive == 'text/css' ? rewriter.css(sendData) :
                            ['text/javascript', 'application/x-javascript', 'application/javascript'].includes(directive) ? rewriter.js(sendData) : 
                            sendData;
                        };

                        resp.writeHead(clientResp.statusCode, Object.entries(clientResp.headers).map(([header, directives]) => rewriter.header([header, directives])).filter(map => map))
                            .end(sendData);
                    })
            );
                
        client.on('error', err => resp.end(err.message));
        
        req.on('data', data => client.write(data))
            .on('end', () => client.end());
    };

    ws(server) {
        new WebSocket.Server({ server: server }).on('connection', (client, req, msgParts = []) => {
            try {
                this.clientUrl = new URL(req.url.slice(this.prefix.length));
            } catch (err) {
                return client.end();
            }

            const sendReq = new WebSocket(clientUrl.href, { headers: req.headers }).on('message', msg => client.send(msg))
                .on('open', () => sendReq.send(msgParts))
                .on('error', () => client.end()).on('close', () => client.close());

            client.on('message', msg => sendReq.readyState == WebSocket.open ? sendReq.send(msg) : msgParts.push(msg))
                .on('error', () => sendReq.end())
                .on('close', () => sendReq.close());
        });
    };
}
