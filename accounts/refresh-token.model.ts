import { DataTypes } from 'sequelize';

export default function model(sequelize: any) {
  const attributes = {
    token: { type: DataTypes.STRING },
    expires: { type: DataTypes.DATE },
    created: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    createdByIp: { type: DataTypes.STRING },
    revoked: { type: DataTypes.DATE },
    revokedByIp: { type: DataTypes.STRING },
    replacedByToken: { type: DataTypes.STRING },
    isActive: {
      type: DataTypes.VIRTUAL,
      get() { return !this.revoked && new Date() < this.expires; }
    },
    isExpired: {
      type: DataTypes.VIRTUAL,
      get() { return new Date() > this.expires; }
    }
  };

  const options = { timestamps: false };
  return sequelize.define('refreshToken', attributes, options);
}