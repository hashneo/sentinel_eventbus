'use strict';

module.exports.register = (req, res) => {

    let data = req.swagger.params.data.value;

    global.module.add(data);

    res.status(200).end();
};

module.exports.notify = (req, res) => {

    let data = req.swagger.params.data.value;

    global.module.notify(data)
        .then( () => {
            res.status(200).end();
        })
        .catch( (err) => {
            return res.status(500).json( { code: 500, message: err.message } );
        });
};
