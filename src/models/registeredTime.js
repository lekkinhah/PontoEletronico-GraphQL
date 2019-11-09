const { Model, DataTypes } = require('sequelize')
const Sequelize = require('../database')
const User = require('./user')

class RegisteredTime extends Model {
    static associate() {
        User.hasMany(RegisteredTime)
        RegisteredTime.belongsTo(User)
    }
}

RegisteredTime.init({
    timeRegistered: DataTypes.STRING,   
}, { sequelize: Sequelize, modelName: 'registeredTime' })

RegisteredTime.associate()

module.exports = RegisteredTime