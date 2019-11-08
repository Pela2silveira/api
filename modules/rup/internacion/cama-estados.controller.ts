import * as mongoose from 'mongoose';
import moment = require('moment');
import { CamaEstados } from './cama-estados.schema';

export async function snapshotEstados({ fecha, organizacion, ambito, capa }, filtros) {
    const firstMatch = {};
    const secondMatch = {};

    if (filtros.cama) {
        firstMatch['idCama'] = mongoose.Types.ObjectId(filtros.cama);
    }

    if (filtros.paciente) {
        secondMatch['estados.paciente.id'] = mongoose.Types.ObjectId(filtros.paciente);
    }

    if (filtros.internacion) {
        secondMatch['estados.idInternacion'] = mongoose.Types.ObjectId(filtros.internacion);
    }

    if (filtros.estado) {
        secondMatch['estados.estado'] = filtros.estado;
    }

    const aggregate = [
        {
            $match: {
                idOrganizacion: mongoose.Types.ObjectId(organizacion),
                ambito,
                capa,
                start: { $lte: moment(fecha).toDate() },
                ...firstMatch
            }
        },
        {
            $unwind: '$estados',
        },
        {
            $group: {
                _id: '$idCama',
                fechaMax: {
                    $max: '$estados.fecha'
                }
            }
        },
        {
            $lookup: {
                from: 'internacionCamaEstados',
                let: {
                    idCama: '$_id',
                    fechaMax: '$fechaMax'
                },
                pipeline: [
                    {
                        $match: {
                            idOrganizacion: mongoose.Types.ObjectId(organizacion),
                            ambito,
                            capa,
                            $expr: {
                                $and: [
                                    { $eq: ['$idCama', '$$idCama'] },
                                    { $lte: ['$start', '$$fechaMax'] },
                                    { $gte: ['$end', '$$fechaMax'] }
                                ]
                            },
                        }
                    },
                    {
                        $unwind: '$estados',
                    },
                    {
                        $match: {
                            $expr: { $eq: ['$estados.fecha', '$$fechaMax'] }
                        }
                    }
                ],
                as: 'estado'
            }
        },
        {
            $unwind: '$estado'
        },
        {
            $addFields: {
                'estado.estados.idCama': '$_id',
                'estado.estados.ambito': '$ambito',
                'estado.estados.capa': '$capa',
            }
        },
        {
            $replaceRoot: {
                newRoot: '$estado.estados'
            }
        },
        {
            $match: secondMatch
        },
        {
            $lookup: {
                from: 'internacionCamas',
                localField: 'idCama',
                foreignField: '_id',
                as: 'cama'

            }
        },
        {
            $replaceRoot: {
                newRoot: { $mergeObjects: ['$$ROOT', { $arrayElemAt: ['$cama', 0] }] }
            }
        }
    ];

    return await CamaEstados.aggregate(aggregate);
}


export async function searchEstados({ desde, hasta, organizacion, ambito, capa }, filtros) {
    const firstMatch = {};
    const secondMatch = {};

    if (filtros.cama) {
        firstMatch['idCama'] = mongoose.Types.ObjectId(filtros.cama);
    }

    if (filtros.paciente) {
        secondMatch['estados.paciente.id'] = mongoose.Types.ObjectId(filtros.paciente);
    }

    if (filtros.internacion) {
        secondMatch['estados.idInternacion'] = mongoose.Types.ObjectId(filtros.internacion);
    }

    if (filtros.estado) {
        secondMatch['estados.estado'] = filtros.estado;
    }

    const aggregate = [
        {
            $match: {
                idOrganizacion: mongoose.Types.ObjectId(organizacion),
                ambito,
                capa,
                start: { $lte: moment(hasta).toDate() },
                end: { $gte: moment(desde).toDate() },
                ...firstMatch
            }
        },
        {
            $unwind: 'estados',
        },
        {
            $match: {
                'estados.fecha': {
                    $lte: moment(hasta).toDate(),
                    $gte: moment(desde).toDate()
                },
                ...secondMatch
            }
        },
    ];

    return await CamaEstados.aggregate(aggregate);
}

export async function store({ organizacion, ambito, capa, cama }, estado) {
    return await CamaEstados.update(
        {
            idOrganizacion: mongoose.Types.ObjectId(organizacion),
            ambito,
            capa,
            idCama: mongoose.Types.ObjectId(cama),
            start: { $lte: estado.fecha },
            end: { $gte: estado.fecha }
        },
        {
            $push: { estados: estado },
            $setOnInsert: {
                idOrganizacion: mongoose.Types.ObjectId(organizacion),
                ambito,
                capa,
                idCama: mongoose.Types.ObjectId(cama),
                start: moment(estado.fecha).startOf('month').toDate(),
                end: moment(estado.fecha).endOf('month').toDate(),
            }
        },
        {
            upsert: true
        }
    );
}
