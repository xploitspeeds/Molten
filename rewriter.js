const nodejs = typeof exports !== 'undefined' && this.exports !== exports,
    url = nodejs ? require('url') : null;

module.exports = class {
    constructor(passthrough = {}) {
        this.httpPrefix = passthrough.httpPrefix,
        this.wsPrefix = passthrough.wsPrefix,
        this.baseUrl = passthrough.baseUrl,
        this.clientUrl = passthrough.clientUrl,

        Object.assign(globalThis, this);
    };

    cookie = {
        get: (expList) => expList.map(pair => {
            const split = pair.split('=');
        
            if (split.length == 2 && split[0] == 'original') return this.originalCookie = split[1].replace(/&equiv;/, '=');
        }),

        set: (pairList) => pairList.map(pair => {
            const split = pair.split('=');
        
            if (split.length == 2) split[1] = split[0] == 'domain' ? this.baseUrl.hostname :
            split[0] == 'path' ? this.httpPrefix + split[1] :
            split[1];

            return split.join('=') + 'original=' + split[1].replace(/=/g, '&equiv;');
        })
    };

    header(key, value) {
        return key == 'host' ? this.clientUrl.host :
        ['cookie', 'cookie2'].includes(key) ? cookie.get(value) :
        key == 'content-security-policy' ? value.map(directive => {
            // TODO: Add support
            // For now the header will be deleted
            // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy
        }) :
        key == 'location' ? this.httpPrefix + value :
        key == 'referrer' ? value.slice(this.httpPrefix.length) :
        ['set-cookie', 'set-cookie2'].includes(key) ? cookie.set(value) :
        value;
    }

    htmlUrl(url) {
        return url.startsWith('//') ? this.httpPrefix + url.slice(2) :
        url.startsWith('/') ? this.httpPrefix + this.clientUrl.href + url :
        ['http', 'https'].includes(url.split(':')[0]) ? url :
        this.httpPrefix + this.clientUrl.href + url;
    }

    html(body) {
        const jsdom = nodejs ? require('jsdom').JSDOM : null, 
            fs = nodejs ? require('fs') : null, 
            dom = nodejs ? new jsdom(body, { contentType: 'text/html', resources: "usable" }) : new DOMParser.parseFromString(body, 'text/html');

        dom.window.document.querySelectorAll('*').forEach(node => {
            node.textContent = node.tagname == 'SCRIPT' ? this.js(node.textContent) :
            node.tagname == 'STYLE' ? this.css(node.textContent) : node.textContent
                
            node.getAttributeNames().forEach(attr => {
                const value = node.getAttribute(attr);

                if (['action', 'content', 'data', 'href', 'poster', 'xlink:href'].includes(attr)) node.setAttribute(attr, this.htmlUrl(value));
                else if (['integrity', 'nonce'].includes(attr)) node.removeAttribute(attr);
                else if (attr == 'style') node.setAttribute(attr, this.css(value)); 
                else if (attr.startsWith('on-')) node.setAttribute(this.js(value));
                else if (attr == 'srcdoc') node.setAttribute(attr, this.html(value));
                else if (attr == 'srcset') node.setAttribute(attr, value.split(', ').map((val, i) => i % 2 && this.htmlUrl(val)).join(', '));
            })
        });

        if (nodejs) {
            let elm = dom.window.document.createElement('SCRIPT');

            elm.textContent = fs.readFileSync('rewriter.js', 'utf8')
            .replace(/INSERT_HTTP_PREFIX/g, this.httpPrefix)
            .replace(/INSERT_WS_PREFIX/g, this.wsPrefix)
            .replace(/INSERT_BASE_URL/g, this.baseUrl)
            .replace(/INSERT_CLIENT_URL/g, this.clientUrl)
            .replace(/INSERT_DOM/g, body)
            .replace(/INSERT_ORIGINAL_COOKIE/g, this.originalCookie);

            dom.window.document.getElementsByTagName('HEAD')[0].appendChild(elm);
        }

        return nodejs ? dom.serialize() : dom.querySelector('*').outerHTML;
    }

    css(body) {
        return body.replace(/(?<=url\((?<a>["']?)).*?(?=\k<a>\))|(?<=@import *(?<b>"|')).*?(?=\k<b>.*?;)/g, this.baseUrl + this.httpPrefix + body);
    }

    js(body) {
        'let document=proxifiedDocument;' + body;
    }
};

if (!nodejs) {
    const passthrough = {
            httpPrefix: 'INSERT_HTTP_PREFIX',
            wsPrefix: 'INSERT_WS_PREFIX',
            baseUrl: INSERT_BASE_URL,
            clientUrl: INSERT_PROXY_URL,
            original: {
                dom: 'INSERT_DOM',
                cookie: 'INSERT_ORIGINAL_COOKIE'
            }
        },
        rewriter = new rewriter({
            httpPrefix: passthrough.httpPrefix,
            wsPrefix: passthrough.wsPrefix,
            baseUrl: passthrough.baseUrl,
            clientUrl: passthrough.clientUrl
        }),

    proxifiedDocument = new Proxy(document, {
        set: (target, prop) => ['location', 'referrer', 'URL'].includes(prop) ? rewriter.url(target) :
            prop == 'cookie' ? rewriter.cookie.set(target) : 
            target
    });

    document.write = new Proxy(document.write, {
        apply(target, thisArg, args) {
            args[0] = rewriter.html(args[0]);

            return Reflect.apply(target, thisArg, args);
        }
    });

    window.fetch = new Proxy(window.fetch, {
        apply(target, thisArg, args) {
            args[0] = rewriter.url(args[0]);

            return Reflect.apply(target, thisArg, args);
        }
    });

    const historyHandler = {
        apply(target, thisArg, args) {
            args[2] = rewriter.url(args[2]);

            return Reflect.apply(target, thisArg, args);
        }
    };

    window.History.prototype.pushState = new Proxy(window.History.prototype.pushState, historyHandler);
    window.History.prototype.replaceState = new Proxy(window.History.prototype.replaceState, historyHandler);

    window.Navigator.prototype.sendBeacon = new Proxy(window.Navigator.prototype.sendBeacon, {
        apply(target, thisArg, args) {
            args[0] = rewriter.url(args[0]);

            return Reflect.apply(target, thisArg, args);
        }
    }); 

    window.open = new Proxy(window.open, {
        apply(target, thisArg, args) {
            args[0] = rewriter.url(args[0]);

            return Reflect.apply(target, thisArg, args);
        }
    });

    window.postMessage = new Proxy(window.postMessage, {
        apply(target, thisArg, args) {
            args[1] = passthrough.baseUrl.href;

            return Reflect.apply(target, thisArg, args);
        }
    });

    window.WebSocket = new Proxy(window.WebSocket, {
        construct(target, args) {
            args[0] = passthrough.baseUrl.href + passthrough.httpPrefix + args[0];
            
            return Reflect.construct(target, args);
        }
    });

    window.Worker = new Proxy(window.Worker, {
        construct(target, args) {
            args[0] = rewriter.url(args[0]);

            return Reflect.construct(target, args);
        }
    });
    
    window.XMLHttpRequest.prototype.open = new Proxy(window.XMLHttpRequest.prototype.open, {
        apply(target, thisArg, args) {
            args[1] = rewriter.url(args[1]);

            return Reflect.apply(target, thisArg, args);
        }
    });

    document.currentScript.remove();

    delete window.MediaStreamTrack; 
    delete window.RTCPeerConnection;
    delete window.RTCSessionDescription;
    delete window.mozMediaStreamTrack;
    delete window.mozRTCPeerConnection;
    delete window.mozRTCSessionDescription;
    delete window.navigator.getUserMedia;
    delete window.navigator.mozGetUserMedia;
    delete window.navigator.webkitGetUserMedia;
    delete window.webkitMediaStreamTrack;
    delete window.webkitRTCPeerConnection;
    delete window.webkitRTCSessionDescription;
}