'use strict';
require('array.prototype.find');

const bent = require('bent');
const crypto = require('crypto');

function EventBus(config) {

    if ( !(this instanceof EventBus) ){
        return new EventBus(config);
    }

    const logger = require('sentinel-common').logger;

    const messageHandler = require('./messageHandler')();

    if ( config.webhook === undefined ) {
        config.webhook = {
            endpoints: {}
        };
    }

    this.add = (h) => {
        let key = crypto.createHash('md5').update(h.url).digest("hex");

        let endPoints = config.webhook.endpoints;

        if (endPoints === undefined)
            endPoints = {};

        endPoints[ key ] = h;
        config.webhook.endpoints = endPoints;
        config.save();
    };

    this.notify = (data) =>{
        logger.debug(`Event posted -> ${JSON.stringify(data)}`);
        return messageHandler.post( data.source + '.' + data.type, data.payload );
    };

    setInterval( () =>{

        let endPoints = config.webhook.endpoints || {};

        for (let i in endPoints) {

            let endPoint = endPoints[i];

            if ( endPoint.lastNotify ) {
                let now = new Date();
                let lastNotify = new Date(endPoint.lastNotify);

                let d = ((now - lastNotify) / 1000) / 3600;

                if (d >= 7) {
                    logger.info(`Endpoint '${endPoint.url}' hasn't responded for 7 days, deleting`);
                    delete endPoints[i];
                }
            }
        }

        config.save();

    }, 5000 );

    let messageQueue = {};

    setInterval( async () =>{

        Object.keys( messageQueue ).forEach( async (k) => {

            let queueMessages = messageQueue[k];

            if ( queueMessages.length > 0 ) {
                logger.debug(`Queue length '${queueMessages.length}' for endpoint '${k}'`);
            }

            while(queueMessages.length > 0) {

                let it = queueMessages.shift();

                let endPoint = it.endPoint;
                let type = it.type;
                let data = it.data;

                const _notify = bent(endPoint.method, 200);

                let url = endPoint.url;

                let headers = {
                    'content-type': 'application/json',
                    'x-security-key': endPoint.securityKey
                };

                let evt = {
                    source: 'sentinel',
                    type: type,
                    timestamp: new Date().toISOString(),
                    payload: data,
                };

                logger.trace(JSON.stringify(evt));

                try {
                    let res = await _notify(url, evt, headers);

                    if (res.statusCode === 200) {
                        logger.debug(`Endpoint ${endPoint.url} notified with -> ${JSON.stringify(data)}`);
                        endPoint.lastNotify = new Date().toISOString();
                    } else {
                        queueMessages.unshift(it);
                        logger.debug(`Endpoint ${endPoint.url} notification failed`);
                        break;
                    }
                }
                catch(err){
                    queueMessages.unshift(it);
                    logger.debug('Notify error: ' + err);
                    break;
                }
            }
        })


    }, 500 );

    function addMessage( type, data ){
        let endPoints = config.webhook.endpoints || {};

        for (let i in endPoints) {

            let endPoint = endPoints[i];

            if ( messageQueue[endPoint.url] === undefined )
                messageQueue[endPoint.url] = [];

            messageQueue[endPoint.url].push( { endPoint : endPoint, type: type, data : data } );

            let queueMessages = messageQueue[endPoint.url];

            if ( queueMessages.length > 100 ) {
                logger.warn(`Queue length > 100 ('${queueMessages.length}') for endpoint '${endPoint.url}'`);
            }

        }
    }

    messageHandler.on('device.update', (data) => {
        addMessage( 'device.update', data );
    });

    messageHandler.on('device.insert', (data) => {
        addMessage( 'device.insert', data );
    });
}

module.exports = EventBus;