module.exports = class {
    constructor(passthrough = {}) {
        this.prefix = passthrough.prefix,
        this.tor = passthrough.tor;

        Object.assign(globalThis, this);
    };

    http = (req, resp) => (
        Rewriter = require('./rewriter'),

        reqProto = (
            req.connection.encrypted
                ? 'https'
            : !req.connection.encrypted 
                ? 'http'
            : null
        ),

        baseUrl = `${reqProto}://${req.headers.host}`,

        clientUrl = req.url.slice(this.prefix.length),

        rewriter = new Rewriter({
            prefix: this.prefix,
            baseUrl: baseUrl, 
            clientUrl: this.clientUrl
        }),

        // TODO: Implement tor request support
        client = require(reqProto).request (
            clientUrl,
            { 
                headers: 
                    Object
                        .entries(req.headers)
                        .map(([header, directives]) => rewriter.header([header, directives]))
                        .filter(map => map),
                method: req.method,
                followAllRedirects: false 
            }, 
            (clientResp, streamData = [], sendData = '') => 
                clientResp
                    .on('data', data => streamData.push(data))
                    .on ('end', () => (
                        zlib = require('zlib'),

                        enc = clientResp.headers['content-encoding'],
                        type = clientResp.headers['content-type'],

                        zlib[['gunzipSync' ,'inflateSync' ,'brotliDecompressSync'][['gzip', 'deflate', 'br'].indexOf(enc)]](Buffer.concat(streamData).toString()),

                        rewriter[['html', 'css', 'js', 'manifest'][['text/html', 'text/css', ['application/javascript', 'application/x-javascript', 'text/javascript'], ['application/json', 'text/json']].indexOf(type)]],

                        resp
                            .writeHead (
                                clientResp.statusCode, 

                                Object
                                    .entries(clientResp.headers)
                                    .map(([header, directives]) => rewriter.header([header, directives]))
                                    .filter(map => map)
                            )
                            .end(sendData)
                        )
                    )
                ),
                
        client.on('error', err => resp.end(err.message)),
                                
        req
            .on('data', data => client.write(data))
            .on('end', () => client.end())
    );

    ws = server => (
        WebSocket = require('ws'), 

        new WebSocket.Server({ server: server })).on('connection', (client, req) => (
            clientUrl = req.url.slice(this.prefix.length),

            sendReq = new WebSocket(clientUrl, { headers: req.headers })
                .on('message', msg => client.send(msg))
                .on('open', () => sendReq.send(msgParts))
                .on('error', () => client.end())
                .on('close', () => client.close()),

            client
                .on('message', msg => 
                    sendReq.readyState == WebSocket.open 
                        ? sendReq.send(msg)
                    : msgParts.push(msg)
                )
                .on('error', () => sendReq.end())
                .on('close', () => sendReq.close())
        )
    );
}