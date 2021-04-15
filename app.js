module.exports = class {
    constructor(config = {}) {
        Object.assign(globalThis, config);
    };

    http = (req, resp) => (
        url = req.url.slice(this.prefix.length),
        
        proto = (
            req.connection.encrypted
                ? 'https'
            : !req.connection.encrypted 
                ? 'http'
            : null
        ),

        rewriter = new require('./rewriter')({
            prefix: config.prefix,
            url: url
        }),

        cli = 
            require (
                typeof config.socks5 == undefined 
                    ? proto
                : `socks5-${proto}-client`
            ).request (
                url,
                { 
                    headers: 
                        Object
                            .entries(req.headers)
                            .map(([header, directives]) => rewriter.header([header, directives]))
                            .filter(map => map),
                    method: req.method,
                    followAllRedirects: false,
                    socksHost: config.socks5.host,
                    socksPort: config.socks5.port,
                    socksUsername: config.socks5.username,
                    socksPassword: config.socks5.password
                }, 
                (cliResp, streamData = [], sendData = '') => 
                    cliResp
                        .on('data', data => streamData.push(data))
                        .on('end', () => (
                            sendData = rewriter[['html', 'css', 'js', 'manifest'][['text/html', 'text/css', ['application/javascript', 'application/x-javascript', 'text/javascript'], ['application/json', 'text/json']].indexOf(cliResp.headers['content-type'])]](require('zlib')[['gunzipSync' ,'inflateSync' ,'brotliDecompressSync'][['gzip', 'deflate', 'br'].indexOf(cliResp.headers['content-encoding'])]](Buffer.concat(streamData).toString())),

                            resp
                                .writeHead (
                                    cliResp.statusCode,
                                    Object
                                        .entries(cliResp.headers)
                                        .map(([header, directives]) => rewriter.header([header, directives]))
                                        .filter(map => map)
                                )
                                .end(sendData)
                            )
                        )
                    ),
                    
            client.on('error', err => resp.end(err.message)),
                                    
            req
                .on('data', data => cli.write(data))
                .on('end', () => cli.end())
        );

    ws = server => (
        WebSocket = require('ws'), 

        new WebSocket.Server({ server: server })).on('connection', (cli, req) => (
            cliReq = new WebSocket (
                req.url.slice(this.prefix.length),
                {
                    headers: req.headers,
                    agent: require(`socks5-${null}-client/lib/Agent`)
                }
            )
                .on('message', msg => cli.send(msg))
                .on('open', () => sendReq.send(msgParts))
                .on('error', () => cli.end())
                .on('close', () => cli.close()),

            cli
                .on('message', msg => 
                    cliReq.readyState == WebSocket.open 
                        ? cliReq.send(msg)
                    : msgParts.push(msg)
                )
                .on('error', () => cliReq.end())
                .on('close', () => cliReq.close())
        )
    );
}