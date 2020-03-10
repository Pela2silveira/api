
import { MongoQuery, ResourceBase } from '@andes/core';
import { Modulos } from './modulo.schema';

class ModuloResource extends ResourceBase {
    Model = Modulos;
    resourceName = 'modulos';
    searchFileds = {
        search: ['nombre'],
        nombre: MongoQuery.partialString,
        descripcion: MongoQuery.partialString,
        claseCss: MongoQuery.partialString,
        linkAcceso: MongoQuery.partialString,
        icono: MongoQuery.partialString,
        subtitulo: MongoQuery.partialString,
        permisos: {
            field: 'permisos.id',
            fn: (value) => {
                return { $in: value };
            }
        }
    };
}
export const ModulosCtr = new ModuloResource({});
export const ModulosRouter = ModulosCtr.makeRoutes();