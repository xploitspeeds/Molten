const nodejs = typeof exports !== 'undefined' && this.exports !== exports;

nodejs && (
    url = require('url'),
    util = require('util') 
);

module.exports = class {
    constructor(passthrough = {}) {
        this.prefix = passthrough.prefix,
        this.baseUrl = passthrough.baseUrl,
        this.clientUrl = passthrough.clientUrl; 
    };

    cookie = {
        get: directives => null,

        set: directives => 
            directives
                .join``
                .split`; `
                .map(directive =>
                    pair = directive.split`=`,
                    pair.length == 2
                        ? pair[1] = pair[0] == 'domain' ? this.baseUrl.hostname :
                        pair[0] == 'path' ? this.prefix + pair[1] :
                        pair[1]
                        // TODO: Instead use array mainipulation
                        : pair.join`=` + pair[1].replace(/=/g, '&equiv;')
                )
                .join``
    };

    header = ([header, directives]) => 
        this.csp = 
            header == 'content-security-policy' 
                ? null
                : null,
        this.tao = 
            header == 'timing-allow-origin' 
                ? null 
                : null,
        ['content-encoding', 'content-length', 'content-security-policy', 'timing-allow-origin', 'transfer-encoding', 'referrer-policy', 'x-frame-options'].includes(header) 
            ? null
        : header == 'host' 
            ? [header, this.clientUrl.host] 
        : ['cookie', 'cookie2'].includes(header)
            ? [header, this.cookie.get(directives)]
        : header == 'location' 
            ? [header, this.prefix + directives]
        : header == 'referrer' 
            ? [header, directives.slice(this.prefix.length)] 
        : ['set-cookie', 'set-cookie2'].includes(header)
            ? [header, this.cookie.set(directives)] 
        : [header, directives];

    url = url => null;

    attr = ([attr, src]) => 
        ['action', 'data', 'href', 'poster', 'src', 'xlink:href'].includes(attr) 
            ? [attr, this.url(src)]
        : ['integrity', 'nonce'].includes(attr) 
            ? null
        : attr.startsWith`on-` 
            ? this.js(src) 
        : attr == 'style' 
            ? [attr, this.css(src)]
        : attr == 'srcdoc' 
            ? [attr, this.html(src)]
        : attr == 'srcset' 
            ? [attr, src.split` `.map((src, i) => !(i % 2) ? this.url(src) : src).join` `] 
        : [attr, value];

    html = body => 
        nodejs 
            ? (
                parse5 = require('parse5'),
                ast = parse5.parse(body),
                ast.walk(ast => 
                    ast.tagName == 'script' || ast.tagName == 'style' && (ast.childNodes[0].value = this[ast.tagName](ast.childNodes[0].value)),
                    ast.attrs.forEach(attr => rewrite.attr([attr.name, attr.value]))
                ),
                parse5.serialize(ast)
            )
            : (
                ast = new DOMParser.parseFromString(body, 'text/html'),
                ast.querySelectorAll`*`.forEach(elm =>
                    elm.textContent = 
                        elm.tagName == 'SCRIPT' 
                            ? this.js(elm.textContent) 
                        : elm.tagName == 'STYLE'
                            ? this.css(elm.textContent)
                        : elm.textContent,
                    elm.getAttributeNames().forEach(name => elm.setAttribute(...this.attr([name, elm.getAttribute(name)])))
                ),
                ast.querySelector`*`.outerHTML
            );

    css = body => 
        nodejs
            ? (
                csstree = require('css-tree'),
                ast = csstree.parse(body),
                csstree.walk(ast, node => node.type == 'Url' && this.url(node.value)),
                csstree.generate(ast)
            )
            : (
                dom = new DOMParser.parseFromString(`<style>${body}</style>`, 'text/html'),
                Object
                    .entries(dom.styleSheets)
                    .map(([i, ast]) => ast.cssRules.map(rule => rule.type == 'Url' && this.url(rule.cssText))),
                dom.getElementsByTagName`style`.innerHTML
            )

    js = body => `{document=proxifiedDocument;${body}`;
};

!nodejs && (
    passthrough = {
        prefix: 'INSERT_PREFIX', 
        baseUrl: INSERT_BASE_URL, 
        clientUrl: INSERT_CLIENT_URL, 
        security: {
            cors: INSERT_CORS,
            tao: INSERT_TAO
        }, 
        original: {
            cookie: unescape`INSERT_COOKIE`,
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
    },
    element
        .prototype
            .innerHTML = new Proxy(element.prototype.innerHTML, htmlHandler)
            .outerHTML = new Proxy(element.prototype.outerHTML, htmlHandler)
        .setAttribute = new Proxy(element.prototype.setAttribute, {
            apply(target, thisArg, args) {
                args = rewriter.attr(args);
    
                return Reflect.apply(target, thisArg, args);
            }
        }),
    window.proxifiedDocument = new Proxy(document, {
        get(target, prop) {
            target[prop] = null;

            return Reflect.get(target, prop);
        },
        set(target, prop) {
            target[prop] = null;

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
                args[0] = null;

                return Reflect.apply(target, thisArg, args);
            }
        })
        .postMessage = new Proxy(window.postMessage, {
            apply(target, thisArg, args) {
                args[1] = null;

                return Reflect.apply(target, thisArg, args);
            }
        })
        .WebSocket = new Proxy(window.WebSocket, {
            construct(target, args) {
                const url = new URL(args[0]);

                args[0] = null;
                
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
        }),
    delete window.MediaStreamTrack, 
    delete window.RTCPeerConnection,
    delete window.RTCSessionDescription,
    delete window.mozMediaStreamTrack,
    delete window.mozRTCPeerConnection,
    delete window.mozRTCSessionDescription,
    delete window.navigator.getUserMedia,
    delete window.navigator.mozGetUserMedia,
    delete window.navigator.webkitGetUserMedia,
    delete window.webkitMediaStreamTrack,
    delete window.webkitRTCPeerConnection,
    delete window.webkitRTCSessionDescription,
    document.currentScript.remove()
)