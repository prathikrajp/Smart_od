const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
    try {
        const uri = process.env.MONGODB_URI;
        if (!uri) {
            console.error('❌ MONGODB_URI is missing from .env file.');
            process.exit(1);
        }

        await mongoose.connect(uri);

        console.log('✅ MongoDB Atlas Connected Successfully');
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error.message);
        
        if (error.message.includes('ESERVFAIL')) {
            console.error('👉 TIP: This is likely a DNS resolution issue. Check your internet connection or if the MongoDB URI cluster name is correct.');
        } else if (error.message.includes('ENOTFOUND')) {
            console.error('👉 TIP: The MongoDB host was not found. Verify the connection string in your .env file.');
        } else if (error.message.includes('MongooseServerSelectionError')) {
            console.error('👉 TIP: Mongoose could not connect to any servers in your cluster. Check your IP Whitelist in MongoDB Atlas or connection string.');
        }

        process.exit(1);
    }
};

module.exports = connectDB;
