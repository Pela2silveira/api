import * as mongoose from 'mongoose';
import { IParentescoDoc } from './parentesco.interface';

export const ParentescoSchema = new mongoose.Schema({
    nombre: String,
    opuesto: String
});

export const Parentesco = mongoose.model<IParentescoDoc>('parentesco_2', ParentescoSchema, 'parentesco');