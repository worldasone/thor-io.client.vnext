"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Utils_1 = require("../Utils/Utils");
var PropertyMessage = (function () {
    function PropertyMessage() {
        this.messageId = Utils_1.Utils.newGuid();
    }
    return PropertyMessage;
}());
exports.PropertyMessage = PropertyMessage;
