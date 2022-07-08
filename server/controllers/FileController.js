const fileService = require("../services/fileService");
const config = require("config");
const fs = require("fs");
const User = require("../models/User");
const File = require("../models/File");

class FileController {
    async createDir(request, response) {
        try {
            const {name, type, parent} = request.body;
            const file = new File({name, type, parent, user: request.user.id});
            const parentFile = await File.findOne({_id: parent});
            if (!parentFile) {
                file.path = name;
                await fileService.createDir(file);
            } else {
                file.path = `${parentFile.path}\\${file.name}`;
                await fileService.createDir(file);
                parentFile.children.push(file._id);
                await parentFile.save();
            }
            await file.save();
            return response.json(file);
        } catch (error) {
            console.log(error);
            return response.status(400).json(error);
        }
    }

    async getFiles(request, response) {
        try {
            const files = await File.find({user: request.user.id, parent: request.query.parent});
            return response.json(files);
        } catch (error) {
            console.log(error);
            return response.status(500).json({message: "Can not get files"});
        }
    }

    async uploadFile(request, response) {
        try {
            const file = request.files.file;
            const parent = await File.findOne({user: request.user.id, _id: request.body.parent});
            const user = await User.findOne({_id: request.user.id});

            if (user.usedSpace + file.size > user.diskSpace) {
                return response.status(400).json({message: "There are no space in the storage"});
            }

            user.usedSpace += file.size;
            let path;
            if (parent) {
                path = `${config.get("filePath")}\\${user._id}\\${parent.path}\\${file.name}`;
            } else {
                path = `${config.get("filePath")}\\${user._id}\\${file.name}`;
            }

            if (fs.existsSync(path)) {
                return response.status(400).json({message: `File with name ${file.name} already exists in this directory`});
            }
            await file.mv(path);
            const type = file.name.split('.').pop();
            let filePath = file.name;
            if (parent) {
                filePath = parent.path + "\\" + file.name;
            }

            const dbFile = new File({
                name: file.name,
                type: type,
                size: file.size,
                path: filePath,
                parent: parent?._id,
                user: user._id,
            })

            await dbFile.save();
            await user.save();

            return response.json(dbFile);

        } catch (error) {
            console.log(error);
            return response.status(500).json({message: "Upload error"});
        }
    }

    async downloadFile(request, response) {
        try {
            const file = await File.findOne({_id: request.query.id, user: request.user.id})
            const path = config.get('filePath') + '\\' + request.user.id + '\\' + file.path + '\\' + file.name
            if (fs.existsSync(path)) {
                return response.download(path, file.name)
            }
            return response.status(400).json({message: "Download error"})
        } catch (e) {
            console.log(e)
            response.status(500).json({message: "Download error"})
        }
    }

    async removeFile(request, response) {
        try {
            const file = await File.findOne({_id: request.query.id, user: request.user.id})
            const user = await User.findOne({_id: request.user.id});
            if (!file) {
                return response.status(400).json({message: "File not found"});
            }
            fileService.removeFile(file);
            await file.remove();
            user.usedSpace -= file.size;
            user.save();
            return response.status(200).json({message: "File was deleted"});

        } catch (error) {
            console.log(error);
            return response.status(400).json({message: "Dir isn't empty"});
        }
    }

}

module.exports = new FileController();
