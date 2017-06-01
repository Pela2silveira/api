import * as mongoose from 'mongoose';
import { tipoPrestacionSchema } from '../../../core/tm/schemas/tipoPrestacion';
// import * as organizacion from '../../../core/tm/schemas/organizacion';

var turnoSchema = new mongoose.Schema({
    horaInicio: Date,
    asistencia: {
        type: Boolean,
        default: false
    },
    estado: {
        type: String,
        enum: ['disponible', 'asignado', 'suspendido', 'turnoDoble'],
        default: 'disponible'
    },
    tipoTurno: {
        type: String,
        enum: ['delDia', 'programado', 'gestion', 'profesional']
    },
    nota: String,
    motivoSuspension: {
        type: String,
        enum: ['edilicia', 'profesional', 'organizacion']
    },
    paciente: { // pensar que otros datos del paciente conviene tener
        id: mongoose.Schema.Types.ObjectId,
        nombre: String,
        apellido: String,
        documento: String,
        telefono: String
    },
    tipoPrestacion: tipoPrestacionSchema,
    // TODO: Enlace con RUP? cuando alguien defina ALGO
    idPrestacionPaciente: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'prestacionPaciente'
    },
    updatedAt: Date,
    updatedBy: mongoose.Schema.Types.Mixed
});

export = turnoSchema;
