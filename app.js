const https = require('https'), 
    http = require('http'),
    WebSocket = require('ws'),
    zlib = require('zlib'), 
    url = require('url'), 
    Rewriter = require('./rewriter');

module.exports = class {
    constructor(passthrough = {}) {
        this.wsPrefix = passthrough.wsPrefix,
        this.httpPrefix = passthrough.httpPrefix;

        Object.assign(globalThis, this);
    };

    http(req, resp) {
        try {
            this.baseUrl = (req.connection.encrypted ? 'https' : !req.connection.encrypted ? 'http' : null) + '://' + req.headers.host,
            this.clientUrl = new URL(req.url.slice(this.httpPrefix.length));
        } catch (error) {
            return resp.end(error.message);
        }

        const rewriter = new Rewriter({
                httpPrefix: this.httpPrefix,
                wsPrefix: this.wsPrefix,
                baseUrl: this.baseUrl, 
                clientUrl: this.clientUrl,
            }), 
            client = (this.clientUrl.protocol == 'https:' ? https : this.clientUrl.protocol == 'http:' ? http : null).request(this.clientUrl.href, { 
                headers: Object.entries(req.headers).map(([key, value]) => [key, rewriter.header(key, value)]),
                method: req.method, 
                followAllRedirects: false 
            }, 
            (clientResp, streamData = [], sendData = '') => clientResp
            .on('data', data => streamData.push(data))
            .on('end', () => {
                const enc = clientResp.headers['content-encoding'];

                if (typeof enc != 'undefined') {
                    enc.split('; ')[0].split(', ').forEach(encType => {
                        sendData = encType == 'gzip' ? zlib.gunzipSync(Buffer.concat(streamData)).toString() :
                        encType == 'deflate' ? zlib.inflateSync(Buffer.concat(streamData)).toString() :
                        encType == 'br' ? zlib.brotliDecompressSync(Buffer.concat(streamData)).toString() : 
                        Buffer.concat(streamData).toString();
                    })
                } else {
                    sendData = Buffer.concat(streamData).toString();
                }

                const type = clientResp.headers['content-type'];

                if (typeof type != 'undefined') {
                    const directive = type.split('; ')[0];
                            
                    sendData = directive == 'text/html' ? rewriter.html(sendData) :
                    directive == 'text/css' ? rewriter.css(sendData) :
                    ['text/javascript', 'application/x-javascript', 'application/javascript'].includes(directive) ? rewriter.js(sendData) :
                    sendData;
                }

                resp.writeHead(clientResp.statusCode, Object.entries(clientResp.headers).map(([key, value]) => ['content-encoding', 'content-length', 'content-security-policy', 'timing-allow-origin', 'transfer-encoding', 'referrer-policy', 'access-control-allow-origin'].includes(key) || key.startsWith('x-') ? null : [key, rewriter.header(key, value)]).filter(map => map))
                .end(sendData);
            }));
            
        client.on('error', error => resp.end(error.message));
        
        req
        .on('data', data => client.write(data))
        .on('end', () => client.end());
    };

    ws(server) {
        new WebSocket.Server({ server: server }).on('connection', (client, req) => {
            try {
                this.clientUrl = new URL(req.url.slice(this.wsPrefix.length)); // might not be req.url
            } catch (err) {
                req.terminate(err);
            }

            let msgParts = [];

            sendReq = new WebSocket(this.clientUrl.href, {
                headers: req.headers
            })
            .on('message', msg => client.send(msg))
            .on('open', () => sendReq.send(msgParts.join('')))
            .on('error', () => client.terminate())
            .on('close', () => client.close());

            client
            .on('message', msg => sendReq.readyState == WebSocket.open ? sendReq.send(msg) : msgParts.push(msg))
            .on('error', () => sendReq.terminate())
            .on('close', () => sendReq.close());
        });
    };
}
