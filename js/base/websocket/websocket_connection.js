"use strict";

const WebsocketBaseConnection = require ('./websocket_base_connection');
const WebSocket = require('ws');

const { sleep } = require ('../functions')

module.exports = class WebsocketConnection extends WebsocketBaseConnection {
    constructor (options, timeout) {
        super();
        this.options = options;
        this.timeout = timeout;
        this.client = {
            ws: null,
            isClosing: false,
            activityTimeout: 120 * 1000,
            pongTimeout: 30 * 1000
        };
        this._activityTimer = undefined;
    }

    resetActivityCheck() {
        if (this._activityTimer) {
            clearTimeout(this._activityTimer);
        }
        if (this.client.isClosing) {
            return;
        }
        var that = this;
        // Send ping after inactivity
        this._activityTimer = setTimeout(function() {
            if (!that.client.isClosing && that.isActive()) {
                if (that.options['verbose']){
                    console.log("WsConnection: ping sent");
                }
                that.client.ws.ping();
                // Wait for pong response
                that._activityTimer = setTimeout(function() {
                    if (!that.client.isClosing && that.isActive()){
                        that.client.ws.close();
                    }
                }, that.client.pongTimeout)
            }
        }, that.client.activityTimeout);
    }
    
    connect() {
        return new Promise ((resolve, reject) => {
            if ((this.client.ws != null) && (this.client.ws.readyState === this.client.ws.OPEN)) {
                resolve();
                return;
            }
            const client = {
                ws: null,
                isClosing: false,
                activityTimeout: 120 * 1000,
                pongTimeout: 30 * 1000
            };
            if (this.options.agent) {
                client.ws = new WebSocket(this.options.url, { agent: this.options.agent });
            } else {
                client.ws = new WebSocket(this.options.url);
            }

            client.ws.on('open', async () => {
                if (this.options['wait-after-connect']) {
                    await sleep(this.options['wait-after-connect']);
                }
                this.emit ('open')
                this.resetActivityCheck(); 
                resolve();
            });

            client.ws.on('error', (error) => {
                if (!client.isClosing) {
                    this.emit('err', error);
                }
                reject(error);
            });
        
            client.ws.on('close', () => {
                if (!client.isClosing) {
                    this.emit('close');
                }
                reject('closing');
            });
        
            client.ws.on('pong', () => {
                if (!client.isClosing) {
                    this.emit('pong');
                }
                this.resetActivityCheck ();
                resolve();
            });
            
            client.ws.on('message', async (data) => {
                if (this.options['verbose']){
                    console.log("WebsocketConnection: "+data);
                }
                
                if (!client.isClosing) {
                    this.emit('message', data);
                }
                resolve();
            });
            this.client = client;
        });
    }

    close () {
        if (this.client.ws != null) {
            this.client.isClosing = true;
            this.client.ws.close();
            this.client.ws = null;
        }
    }

    send (data) {
        if (!this.client.isClosing) {
            this.client.ws.send (data);
        }
    }

    isActive() {
        if (this.client.ws == null){
            return false;
        }
        return (this.client.ws.readyState == this.client.ws.OPEN);
    }
};
