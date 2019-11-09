const { ApolloServer, gql, PubSub } = require('apollo-server')
const Sequelize = require('./database')
const User = require('./models/user')
const RegisteredTime = require('./models/registeredTime')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const AuthDirective = require('./directives/auth')

const pubSub = new PubSub()

const typeDefs = gql`
    enum RoleEnum {
        WORKER
        ADMIN
    }

    directive @auth(
        role: RoleEnum
    ) on OBJECT | FIELD_DEFINITION

    type User {
        id: ID! 
        name: String!
        email: String!
        password: String!
        role: RoleEnum!
        registeredTimes: [RegisteredTime]
    }

    type RegisteredTime {
        id: ID!
        timeRegistered: String!
        user: User!
    }

    type Query {
        allRegisteredTimes: [RegisteredTime] @auth(role: ADMIN)
        allUsers: [User] @auth(role: ADMIN)
    }

    type Mutation {
        createRegisteredTime(data: CreateRegisteredTimeInput): RegisteredTime @auth(role: WORKER)
        updateRegisteredTime(id: ID! data: UpdateRegisteredTimeInput): RegisteredTime
        deleteRegisteredTime(id: ID!): Boolean @auth(role: ADMIN)

        createUser(data: CreateUserInput): User
        updateUser(id: ID! data: UpdateUserInput): User
        deleteUser(id: ID!): Boolean 

        signin(
            email: String!
            password: String!
        ): PayloadAuth
    }

    type PayloadAuth {
        token: String!
        user: User!
    }

    type Subscription {
        onCreatedUser: User
    }

    input CreateUserInput {
        name: String!
        email: String!
        password: String!
        role: RoleEnum!
    }

    input UpdateUserInput {
        name: String
        email: String
        password: String
        role: RoleEnum
    }

    input CreateRegisteredTimeInput {
        timeRegistered: String!
    }

    input UpdateRegisteredTimeInput {
        timeRegistered: String
    }
`

const resolver = {
    Query: {
        allRegisteredTimes() {
            return RegisteredTime.findAll({ include: [User] })
        },
        allUsers() {
            return User.findAll({ include: [RegisteredTime] })
        }
    },
    Mutation: {
        async createRegisteredTime(parent, body, context, info) {
           
            console.log("CRIANDO REGISTRO");
            const token = context.headers.authorization
           
            const jwtData = jwt.decode(token.replace('Bearer ', ''))
            const { id } = jwtData

            const user = await User.findOne({
                where: { id }
            })
            console.log(user)
            const registeredTime = await RegisteredTime.create(body.data)           
           
            await registeredTime.setUser(user.get('id'))
            return registeredTime.reload({ include: [User] })
        },
        async updateRegisteredTime(parent, body, context, info) {
            const registeredTime = await RegisteredTime.findOne({
                where: { id: body.id }
            })
            if (!registeredTime) {
                throw new Error('Registro não encontrado')
            }
            const updatedRegisteredTime = await registeredTime.update(body.data)
            return updatedRegisteredTime
        },
        async deleteRegisteredTime(parent, body, context, info) {
            const registeredTime = await RegisteredTime.findOne({
                where: { id: body.id }
            })
            await registeredTime.destroy()
            return true
        },
        async createUser(parent, body, context, info) {
            body.data.password = await bcrypt.hash(body.data.password, 10)
            const user = await User.create(body.data)
            const reloadedUser = user.reload({ include: [RegisteredTime] })
            pubSub.publish('createdUser', {
                onCreatedUser: reloadedUser
            })
            return reloadedUser
        },
        async updateUser(parent, body, context, info) {
            if (body.data.password) {
                body.data.password = await bcrypt.hash(body.data.password, 10)
            }
            const user = await User.findOne({
                where: { id: body.id }
            })
            if (!user) {
                throw new Error('Usuário não encontrado')
            }
            const updateUser = await user.update(body.data)
            return updateUser
        },
        async deleteUser(parent, body, context, info) {
            const user = await User.findOne({
                where: { id: body.id }
            })
            await user.destroy()
            return true
        },
        async signin(parent, body, context, info) {
            const user = await User.findOne({
                where: { email: body.email }
            })

            if (user) {
                const isCorrect = await bcrypt.compare(
                    body.password,
                    user.password
                )
                if (!isCorrect) {
                    throw new Error('Senha inválida')
                }

                const token = jwt.sign({ id: user.id }, 'secret')

                return {
                    token,
                    user: user
                }
            }
        }
    },
    Subscription: {
        onCreatedUser: {
            subscribe: () => pubSub.asyncIterator('createdUser')
        }
    }
}

const server = new ApolloServer({
    typeDefs: typeDefs,
    resolvers: resolver,
    schemaDirectives: {
        auth: AuthDirective
    },
    context({ req, connection }) {
        if (connection) {
            return connection.context
        }
        return {
            headers: req.headers
        }
    }
});


Sequelize.sync().then(() => {
    server.listen()
        .then(() => {
            console.log('Servidor rodando')
        })
})
