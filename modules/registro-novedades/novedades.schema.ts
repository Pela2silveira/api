import * as mongoose from 'mongoose';
import { ModulosSchema } from './modulo.schema';

export const NovedadesSchema = new mongoose.Schema({
    id: mongoose.Schema.Types.ObjectId,
    fecha: { type: Date, default: Date.now },
    titulo: String,
    descripcion: String,
    modulo: {
        type: ModulosSchema
    },
    imagenes: mongoose.Schema.Types.Mixed,
    activa: Boolean
});

export let Novedades = mongoose.model('Novedades', NovedadesSchema, 'novedad');
