import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

// 1. Defina a interface do Usuário
export interface IUser extends Document {
  username: string;
  password: string;
  role: 'admin' | 'user';
  comparePassword(candidatePassword: string): Promise<boolean>;
}

// 2. Defina o Schema
const UserSchema: Schema<IUser> = new Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user' }
}, { timestamps: true });

// 3. Middleware Pre Save (Correção para Mongoose Moderno + TS)
// Em funções async, não usamos o callback 'next'. 
// O Mongoose aguarda a Promise resolver. Se lançar erro, ele captura.
UserSchema.pre<IUser>('save', async function() {
  // Se a senha não foi modificada, não faz nada
  if (!this.isModified('password')) {
    return;
  }

  try {
    // Gera o hash da senha
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (error) {
    // Lança o erro para o Mongoose capturar
    throw error;
  }
});

// 4. Método para comparar senha
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// 5. Exporta o Modelo
export default mongoose.model<IUser>('User', UserSchema);