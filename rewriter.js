const nodejs = typeof exports !== 'undefined' && this.exports !== exports, 
    url = nodejs ? require('url') : null,
    util = nodejs ? require('util') : null;

module.exports = class {
    constructor(passthrough = {}) {
        this.prefix = passthrough.prefix,
        this.baseUrl = passthrough.baseUrl,
        this.clientUrl = passthrough.clientUrl; 
    };

    cookie = {
        // TODO: Return original cookie value unescaped
        get: directives => null,

        set: directives => 
            directives
                .join``
                .split`; `
                .map(directive => {
                    pair = directive.split`=`;

                    if (pair.length == 2) {
                        pair[1] = pair[0] == 'domain' ? this.baseUrl.hostname :
                        pair[0] == 'path' ? this.prefix + pair[1] :
                        pair[1];

                        return pair.join`=` + pair[1].replace(/=/g, '&equiv;');
                    }
                    else return directive;
                })
                .join``
    };

    header([header, directives]) {
        // TODO: Map header to object
        this.csp = header == 'content-security-policy' ? null : null,
        this.tao = header == 'timing-allow-origin' ? null : null;

        return ['content-encoding', 'content-length', 'content-security-policy', 'timing-allow-origin', 'transfer-encoding', 'referrer-policy', 'x-frame-options'].includes(header) ? null :
        header == 'host' ? [header, this.clientUrl.host] :
        ['cookie', 'cookie2'].includes(header) ? [header, this.cookie.get(directives)] :
        header == 'location' ? [header, this.prefix + directives] :
        header == 'referrer' ? [header, directives.slice(this.prefix.length)] :
        ['set-cookie', 'set-cookie2'].includes(header) ? [header, this.cookie.set(directives)] :
        [header, directives];
    }

    // TODO: Rewrite URLS
    url = url => null;

    // TODO: Emulate security policies
    attr = ([attr, src]) => 
        ['action', 'data', 'href', 'poster', 'src', 'xlink:href'].includes(attr) ? [attr, this.url(src)] :
        ['integrity', 'nonce'].includes(attr) ? null :
        attr.startsWith`on-` ? this.js(src) :
        attr == 'style' ? [attr, this.css(src)] :
        attr == 'srcdoc' ? [attr, this.html(src)] :
        attr == 'srcset' ?  [attr, src.split` `.map((src, i) => !(i % 2) ? this.url(src) : src).join` `] :
        [attr, value];

    // I have decided I should use parse5 instead
    html(body) {
        // TODO: Use parse5 instead
        const jsdom = nodejs ? require('jsdom').JSDOM : null, 
            fs = nodejs ? require('fs') : null, 
            dom = nodejs ? new jsdom(body, { contentType: 'text/html'}) : new DOMParser.parseFromString(body, 'text/html'),
            inject = dom.window.document.createElement`SCRIPT`;
    
        dom.window.document.querySelectorAll`*`.forEach(elm => {
            // BUG: Doing this will break the DOM structure
            /*
            elm.textContent = elm.tagName == 'SCRIPT' ? this.js(elm.textContent) :
            elm.tagName == 'STYLE' ? this.css(elm.textContent) :
            body;
            */

            elm.getAttributeNames().forEach(name => elm.setAttribute(...this.attr([name, elm.getAttribute(name)])));
        });

        nodejs && (
            prefix = 'INSERT',
            inject.textContent = fs.readFileSync('rewriter.js', 'utf8')
                .replaceAll('module.exports', 'Rewriter')
                .replaceAll(prefix + 'PREFIX', this.prefix)
                .replaceAll(prefix + 'BASE_URL', util.inspect(this.baseUrl))
                .replaceAll(prefix + 'CLIENT_URL', util.inspect(this.clientUrl))
                .replaceAll(prefix + 'CORS', util.inspect(this.cors))
                .replaceAll(prefix + 'TAO', util.inspect(this.tao))
                .replaceAll(prefix + 'ORIGINAL_COOKIE', escape(this.originalCookie))
                .replaceAll(prefix + 'DOM', escape(body)),
            // If a meta tag with charset attribute is present move it to the top of the head tag and prepend
            dom.window.document.getElementsByTagName`HEAD`[0].prepend(inject)
        );
        
        return dom.window.document.querySelector`*`.outerHTML;
    }

    // Parse css with the help of domparser object - CSSWG compliant
    // I will post the urls to both the CSSWG specification, DOMParser, Parse5, and the style properties
    css = body => body.replaceAll(/(?<=url\((?<a>["']?)).*?(?=\k<a>\))|(?<=@import *(?<b>"|')).*?(?=\k<b>.*?;)/g, url => this.url(url));

    js = body => '{document=proxifiedDocument;' + body + '}';
};

if (!nodejs) {
    const passthrough = {
            prefix: 'INSERT_PREFIX', 
            baseUrl: INSERT_BASE_URL, 
            clientUrl: INSERT_CLIENT_URL, 
            security: {
                cors: INSERT_CORS,
                tao: INSERT_TAO
            }, 
            original: {
                dom: unescape`INSERT_DOM`
            }
        },
        rewriter = new Rewriter({
            prefix: passthrough.prefix, 
            baseUrl: passthrough.baseUrl, 
            clientUrl: passthrough.clientUrl
        }),
        htmlHandler = {
            apply(target, thisArg, args) {
                args[0] = rewriter.html(args[0]);
    
                return Reflect.apply(target, thisArg, args);
            }
        },
        historyHandler = {
            apply(target, thisArg, args) {
                args[2] = rewriter.url(args[2]);
    
                return Reflect.apply(target, thisArg, args);
            }
        };

    element
        .prototype
            .innerHTML = new Proxy(element.prototype.innerHTML, htmlHandler)
            .outerHTML = new Proxy(element.prototype.outerHTML, htmlHandler)
        .setAttribute = new Proxy(element.prototype.setAttribute, {
            apply(target, thisArg, args) {
                args = rewriter.attr(args);
    
                return Reflect.apply(target, thisArg, args);
            }
        });
    
    // TODO: Instead of rewriting properties that modify and read the dom individually figure out where the DOM tree is actually stored and referenced and proxify the data theres
    // I hope this isn't hidden
    window.proxifiedDocument = new Proxy(document, {
        get(target, prop) {
            target[prop] = 
                prop == 'cookie' ? rewriter.cookie.get(target[prop]) :
                prop == 'location' ? passthrough.clientUrl.href :
                typeof(prop = Reflect.get(target, prop)) == 'function' ? prop.bind(target) : 
                target[prop];

            return Reflect.get(target, prop);
        },

        set(target, prop) {
            target[prop] = 
                prop == 'cookie' ? rewriter.cookie.set(target[prop]) :
                prop == 'location' ? new URL(this.baseUrl.protocol + '//' + this.baseUrl.hostname + this.prefix + (target[prop]).href) :
                prop == 'cookie' ? rewriter.cookie.set(target[prop]) :
                target[prop];

            return Reflect.set(target, prop);
        }
    })
        .fetch = new Proxy(window.fetch, {
            apply(target, thisArg, args) {
                args[0] = rewriter.url(args[0]);

                return Reflect.apply(target, thisArg, args);
            }
        })
        .History.prototype
            .pushState = new Proxy(window.History.prototype.pushState, historyHandler)
            .replaceState = new Proxy(window.History.prototype.replaceState, historyHandler)
        .Navigator.prototype.sendBeacon = new Proxy(window.Navigator.prototype.sendBeacon, {
            apply(target, thisArg, args) {
                args[0] = rewriter.url(args[0]);

                return Reflect.apply(target, thisArg, args);
            }
        })
        .open = new Proxy(window.open, {
            apply(target, thisArg, args) {
                args[0] = passthrough.httpPrefix + args[0];

                return Reflect.apply(target, thisArg, args);
            }
        })
        .postMessage = new Proxy(window.postMessage, {
            apply(target, thisArg, args) {
                args[1] = passthrough.baseUrl.href;

                return Reflect.apply(target, thisArg, args);
            }
        })
        .WebSocket = new Proxy(window.WebSocket, {
            construct(target, args) {
                const url = new URL(args[0]);

                args[0] = url.protocol + '//' + passthrough.baseUrl.host + passthrough.prefix + url.href;
                
                return Reflect.construct(target, args);
            }
        })
        .write = new Proxy(document.write, htmlHandler)
        .Worker = new Proxy(window.Worker, {
            construct(target, args) {
                args[0] = rewriter.url(args[0]);

                return Reflect.construct(target, args);
            }
        })
        .XMLHttpRequest.prototype.open = new Proxy(window.XMLHttpRequest.prototype.open, {
            apply(target, thisArg, args) {
                args[1] = rewriter.url(args[1]);

                return Reflect.apply(target, thisArg, args);
            }
        });

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

    document.currentScript.remove();
}