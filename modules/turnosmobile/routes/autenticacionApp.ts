import * as jwt from 'jsonwebtoken';
import { pacienteApp } from '../schemas/pacienteApp';
import { authApp } from '../../../config.private';
const nodemailer = require('nodemailer');
import * as express from 'express';

let router = express.Router();

router.post('/login', function (req, res, next) {
    var userInfo = setUserInfo(req.body.user);

    res.status(200).json({
        token: 'JWT ' + generateToken(userInfo),
        user: userInfo
    });
});

router.post('/registro', function (req, res, next) {
    var dataPacienteApp = {
        nombre: req.body.nombre,
        apellido: req.body.apellido,
        email: req.body.email,
        password: req.body.password,
        telefono: req.body.telefono,
        envioCodigoCount: 0,
        codigoVerificacion: generarCodigoVerificacion()
    }

    if (!dataPacienteApp.email) {
        return res.status(422).send({ error: 'Se debe ingresar una dirección de e-Mail' });
    }

    if (!dataPacienteApp.password) {
        return res.status(422).send({ error: 'Debe ingresar una clave' });
    }

    pacienteApp.findOne({ email: dataPacienteApp.email }, function (err, existingUser) {

        if (err) {
            return next(err);
        }

        if (existingUser) {
            return res.status(422).send({ error: 'El e-Mail ingresado está en uso' });
        }

        var user = new pacienteApp(
            dataPacienteApp
        );

        user.save(function (err, user) {

            if (err) {
                return next(err);
            }

            var userInfo = setUserInfo(user);

            enviarCodigoVerificacion(user);

            res.status(201).json({
                token: 'JWT ' + generateToken(userInfo),
                user: user
            })

        });

    });

});

router.post('/reenviarCodigo', function (req, res, next) {
    console.log("Reenviar ");
    // enviarCodigoVerificacion(req);
});

//Verifica el código de validación enviado por mail o SMS
router.post('/verificarCodigo', function (req, res, next) {
    let email = req.body.email;
    let codigoIngresado = req.body.codigo;

    pacienteApp.findOne({ email: email }, function (err, datosUsuario) {

        if (verificarCodigo(codigoIngresado.codigo, datosUsuario.codigoVerificacion)) {

            datosUsuario.activacionApp = true;
            datosUsuario.estadoCodigo = true;

            datosUsuario.save(function (err, data) {
                if (err) {
                    return next(err);
                }

                res.json(data);
            });
        }
        else {
            // datosUsuario.
            console.log("Naa que ver");

        }
    });
});

function verificarCodigo(codigoIngresado, codigo) {
    if (codigoIngresado === codigo)
        return true
    else
        return false
}

function enviarCodigoVerificacion(user) {
    console.log("Enviando mail...");
    let transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, // secure:true for port 465, secure:false for port 587
        auth: {
            user: 'publicacionsaludnqn@gmail.com',
            pass: 'saludnqn'
        }
    });

    // setup email data with unicode symbols
    let mailOptions = {
        from: '"Salud 🏥" <publicacionsaludnqn@gmail.com>', // sender address
        to: user.email, // list of receivers
        subject: 'Hola ' + user.nombre + ' ✔', // Subject line
        text: 'Ingrese su código de verificación en la app', // plain text body
        html: '<b>El código de vrificación es: ' + user.codigoVerificacion + '</b>' // html body
    };

    // send mail with defined transport object
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            return console.log("Error al mandar mail: ", error);
        }

        envioCodigoCount(user);
        console.log('Mensaje %s enviado: %s', info.messageId, info.response);
    });
}

function envioCodigoCount(user) {
    pacienteApp.findById(user.id, function (err, data) {


        data.envioCodigoCount = data.envioCodigoCount + 1;
        console.log("Cant de codigo", data.envioCodigoCount);
    });
}

function generateToken(user) {
    return jwt.sign(user, authApp.secret, {
        expiresIn: 10080
    });
}

function generarCodigoVerificacion() {
    let codigo = "";
    let length = 6;
    let caracteres = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < length; i++) {
        codigo += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }

    return codigo;
}

function setUserInfo(request) {
    return {
        _id: request._id,
        email: request.email
    };
}


export = router;