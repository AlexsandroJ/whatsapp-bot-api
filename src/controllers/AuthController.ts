import { Request, Response } from 'express';
import User from '../models/User';
import { generateToken } from '../utils/auth';

export const register = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Preencha todos os campos' });
    }
    
    const userExists = await User.findOne({ username });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'Usuário já existe' });
    }

    const user = await User.create({ username, password });
    const token = generateToken(user.id);

    res.status(201).json({ success: true, token, user: { id: user.id, username: user.username } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Credenciais inválidas' });
    }

    const token = generateToken(user.id);
    res.json({ success: true, token, user: { id: user.id, username: user.username } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
