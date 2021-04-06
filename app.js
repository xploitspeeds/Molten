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
        const baseProtocol = req.connection.encrypted ? 'https' : !req.connection.encrypted ? 'http' : null;

        try {
            this.baseUrl = baseProtocol + '://' + req.headers.host,
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
                headers: Object.entries(req.headers).map(([header, directives]) => rewriter.header([header, directives])).filter(map => map),
                method: req.method, 
                followAllRedirects: false 
            }, 
            (clientResp, streamData = [], sendData = '') => clientResp
                .on('data', data => streamData.push(data))
                .on('end', () => {
                    // TODO: Emulate referrer policy header
                    // TODO: Fix images

                    const enc = clientResp.headers['content-encoding'];

                    try {
                        if (typeof enc != 'undefined') enc.split('; ')[0].split(', ').forEach(encType => {
                            sendData = encType == 'gzip' ? zlib.gunzipSync(Buffer.concat(streamData)).toString() :
                            encType == 'deflate' ? zlib.inflateSync(Buffer.concat(streamData)).toString() :
                            encType == 'br' ? zlib.brotliDecompressSync(Buffer.concat(streamData)).toString() : 
                            null;
                        });
                        else sendData = Buffer.concat(streamData).toString();
                    } catch (error) {
                        resp.writeHead(500, { 'content-type': 'text/plain' })
                            .end(error.message);
                    }

                    const type = clientResp.headers['content-type'];

                    if (typeof type != 'undefined') {
                        const directive = type.split(';')[0];
                    
                        sendData = directive == 'text/html' ? rewriter.html(sendData) :
                        directive == 'text/css' ? rewriter.css(sendData) :
                        ['text/javascript', 'application/x-javascript', 'application/javascript'].includes(directive) ? rewriter.js(sendData) :
                        sendData;
                    }

                    resp
                        .writeHead(clientResp.statusCode, Object.entries(clientResp.headers).map(([header, directives]) => rewriter.header([header, directives])).filter(map => map))
                        .end(sendData);
                }));
                
        client.on('error', error => resp.end(error.message));
        
        req
            .on('data', data => client.write(data))
            .on('end', () => client.end());
    };

    // Instead of having a seperate handler inside of the http handler check if the forwarded header is valid and send a request inside of the function
    // Remove this
    // And also ws prefix wouldn't be needed anymore
    ws(server) {
        new WebSocket.Server({ server: server }).on('connection', (client, req) => {
            try {
                this.clientUrl = new URL(req.resource.slice(this.wsPrefix.length));
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
