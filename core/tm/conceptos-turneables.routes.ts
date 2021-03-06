
import { MongoQuery, ResourceBase } from '@andes/core';
import { tipoPrestacion as TipoPrestacion } from './schemas/tipoPrestacion';
import { Auth } from '../../auth/auth.class';
import { Request, Response } from '@andes/api-tool';

class ConceptoTurneableResource extends ResourceBase {
    Model = TipoPrestacion;
    resourceName = 'conceptos-turneables';
    searchFileds = {
        search: ['term', 'fsn', 'semanticTag'],
        conceptId: MongoQuery.equalMatch,
        term: MongoQuery.partialString,
        fsn: MongoQuery.partialString,
        semanticTag: MongoQuery.partialString,
        noNominalizada: MongoQuery.equalMatch,
        auditable: MongoQuery.equalMatch,
        permisos: {
            field: '_id',
            fn: (value) => {
                return { $in: value };
            }
        }
    };
    middlewares = [Auth.authenticate()];
    routesAuthorization = {
        // Agrega un middlegare antes de la ruta de SEARCH: /conceptos-turneables
        search: (req: Request, res: Response, next) => {
            if (req.query.permisos) {
                const permisosString = req.query.permisos as string;
                const permisos = Auth.getPermissions(req, permisosString);
                if (permisos.length === 1 && permisos[0] === '*') {
                    delete req.query.permisos;
                } else {
                    req.query.permisos = permisos;
                }
            }
            return next();
        }
    };
}
export const ConceptosTurneablesCtr = new ConceptoTurneableResource({});
export const ConceptosTurneablesRouter = ConceptosTurneablesCtr.makeRoutes();
