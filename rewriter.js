const nodejs = typeof exports !== 'undefined' && this.exports !== exports;

// TODO: Add reference to standards
module.exports = class {
    constructor(config = {}) {
        Object.assign(globalThis, config);
    };

    header = ([header, directives]) => (
        ['content-encoding', 'content-length', 'transfer-encoding'].includes(header) 
            ? null
        : header == 'content-security-policy'
            // Content Security Policy Level 3 - https://www.w3.org/TR/CSP3/
            ? (
                this.csp = null,
                null
            )
        : header == 'host' 
            ? [header, null] 
        : ['cookie', 'cookie2'].includes(header)
            ? [header, null]
        : header == 'location' 
            ? [header, null)
        : header == 'referrer' 
            ? [header, null]
        : header == 'referrer-policy'
            // Referrer Policy - https://w3c.github.io/webappsec-referrer-policy/
            ? (
                this.rp = null,
                null
            )
        : ['set-cookie', 'set-cookie2'].includes(header)
            ? [header, null] 
        : header == 'timing-allow-origin'
            // Resource Timing Level 2 - https://w3c.github.io/resource-timing
            ? (
                this.tao = null,
                null
            )
        : header == 'x-frame-options'
            // HTTP Header Field X-Frame-Options - https://tools.ietf.org/html/rfc7034
            ? (
                this.xfo = null,
                null
            )
        : [header, directives]
    );

    // Web Application Manifest - https://w3c.github.io/manifest/
    manifest = body => (
        ast = JSON.parse(body),

        JSON.stringify(ast, (key, value) => 
            ['key', 'src', 'start_url'].includes(key)
                ? null 
            : value
        )
    );

    attr = ([attr, src]) => (
        /*
            Not a complete reference

            Uniform Resource Identifier (URI): Generic Syntax - https://tools.ietf.org/html/rfc3986
            
            The "data" URL scheme - https://tools.ietf.org/html/rfc2397
            The 'mailto' URI Scheme - https://tools.ietf.org/html/rfc6068
            The tel URI for Telephone Numbers - https://tools.ietf.org/html/rfc3966
        */
        url = null,

        ['action', 'href', 'poster', 'src', 'xlink:href'].includes(attr) 
            ? [attr, null]
        : ['integrity', 'nonce'].includes(attr) 
            ? null
        : attr.startsWith`on-` 
            ? this.js(src) 
        : attr == 'style' 
            ? [attr, this.css(src)]
        : attr == 'srcdoc' 
            ? [attr, this.html(src)]
        : attr == 'srcset' 
            ? [attr, src.split` `.map((src, i) => !(i % 2) ? null : src).join` `] 
        : [attr, value]
    );

    // https://github.com/inikulin/parse5/blob/master/packages/parse5/docs/index.md
    html = body => 
        nodejs 
            ? (
                fs = require('fs').promises,
                util = require('util'),
                parse5 = require('parse5'),

                ast = parse5.parse(body),

                ast.walk(ast => (
                    ast.tagName == 'script' || ast.tagName == 'style' && (ast.childNodes[0].value = this[ast.tagName](ast.childNodes[0].value)),

                    ast.attrs.forEach(attr => rewrite.attr([attr.name, attr.value]))
                )),

                ast
                    .createElement('script')
                    .insertText (
                        fs.readFile('rewriter.js') + 
                        `
                        Object.assign (
                            globalthis,
                            {
                                prefix: ${prefix},
                                url: ${url},
                                cors: ${util.inspect(this.cors)},
                                tao: ${util.inspect(this.tao)} ,
                                original: {
                                    cookie: ${this.cookie},
                                    doc: ${body}),
                                }
                            }
                        )
                        `
                    ),
                
                parse5.serialize(ast)
            )
            : (
                // https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-parsing-and-serialization
                ast = new DOMParser.parseFromString(body, 'text/html'),

                ast.querySelectorAll`*`.forEach(elm => (
                    elm.textContent = this[['js', 'css']['SCRIPT', 'STYLE'].indexOf(enc)],
                    elm.getAttributeNames().forEach(name => elm.setAttribute(...this.attr([name, elm.getAttribute(name)])))
                )),

                ast.querySelector`*`.outerHTML
            );

    css = body => (
        url = null,
                    
        nodejs
            ? (
                csstree = require('css-tree'),

                ast = csstree.parse(body),

                // There is a problem due to the fact you can add a variable as an argument
                csstree.walk(ast, node => node.type == 'Url' && null),

                csstree.generate(ast)
            )
            : (
                dom = new DOMParser.parseFromString(`<style>${body}</style>`, 'text/html'),

                Object
                    .entries(dom.styleSheets)
                    .map(([i, ast]) => ast.cssRules.map(rule => rule.type == 'Url' && null)),

                dom.getElementsByTagName`style`.innerHTML
            )
    );

    js = body => `{ document = proxifiedDocument; ${body} }`;
};

!nodejs && (
    rewriter = new Rewriter ({
        prefix: prefix, 
        url: url
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