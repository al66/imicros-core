/**
 * @module repositories/user.js
 *
 * @license MIT, imicros.de (c) 2022 Andreas Leinen
 */
 "use strict";

 const { Repository, Model } = require("../../cqrs/cqrs");

 /**
  * Repository
  */
class UserRepository extends Repository {
    forModel() { return User }

    updateUserMailIndex({ email, uid }) {
        return this.db.updateUserMailIndex({ email, uid });
    }

    getByMail({ email, uid }) {

    }
}

/**
 * Model
 */
class User extends Model {
    onUserCreated (event) {
        this.state.uid = event.userId;
        this.state.createdAt = event.createdAt;
        this.state.email = event.email;
        this.state.groups = [];
    }
    onUserJoinedGroup (event) {

    }
}

 module.exports = {
    UserRepository
} 

