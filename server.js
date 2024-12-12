var http = require("http");
var fs = require("fs");
const path = require('path'); 

listener = ((req, res) => {
    if (req.url.endsWith("/"))
        req.url = req.url + "index.htm";
    else if (/\/[A-Za-z_æøåÆØÅ0-9]+$/.test(req.url)){
        console.log("Regex is true!");
        req.url = req.url + "/index.htm";
    }

    /* MIME types from: https://developer.mozilla.org/en-US/docs/Web/HTTP/MIME_types/Common_types */
    if (req.url.endsWith(".htm"))
        res.writeHead(200, { 'Content-Type': "text/html" });
    else if (req.url.endsWith(".svg")) {
        res.writeHead(200, { 'Content-Type': "image/svg+xml" });
    }
    else if (req.url.endsWith(".webp")) {
        res.writeHead(200, { 'Content-Type': "image/webp" });
    }
    else if (req.url.endsWith(".css")) {
        res.writeHead(200, { 'Content-Type': "text/css" });
    }

    handlePath(req, res, path.join(__dirname, "contents", req.url.replace(/^(\.\.)+/, '')));
});

class ErrorMessages {
    constructor(_res){
        this.warnings = [];
        this.errors = [];
        this.res = _res;
    }

    handle_warning_and_errors(res = this.res){
        if (this.warnings.length == 0 && this.errors.length == 0)
            return;
    
        let str = "";
        if (this.warnings.length != 0){
            str += this.color("yellow", "Warning" + (this.warnings.length == 1 ? "" : "s") + ":\n");
            for (const warning of this.warnings){
                str += this.color("yellow", warning) + "\n";
            }
            str = str.substring(0, str.length-1);
        }
        if (this.errors.length != 0){
            str += this.color("red", "Error" + (this.warnings.length == 1 ? "" : "s") + ":\n");
            for (const error of this.errors){
                str += this.color("red", error) + "\n";
            }
            str = str.substring(0, str.length-1);
        }
        console.log(str);
        if (this.errors.length != 0)
            return res.end(str.replaceAll("\x1b[33m", "<p style='color:yellow'>")
                              .replaceAll("\x1b[0m", "</p>")
                              .replaceAll("\x1b[90m", "<p style='color:gray'>")
                              .replaceAll("\x1b[31m", "<p style='color:red'>"));
    }

    handle_error(error_msg, res = this.res){
        this.errors.push(error_msg);
        this.handle_warning_and_errors(res);
    }

    color(color, text){
        if (color == "yellow")
            return "\x1b[33m" + text + "\x1b[0m";
        else if (color == "red")
            return "\x1b[31m" + text + "\x1b[0m";
        else if (color == "gray")
            return "\x1b[90m" + text + "\x1b[0m";
        console.error("\x1b[31mCOLOR NOT FOUND!\x1b[0m");
        return "\x1b[31m" + text + "\x1b[0m";
    }
}

class RequestedFile extends ErrorMessages {
    structure_dir_path = null;
    structure_file_path = null;
    structure_type = null;

    constructor(_path, _safe_path, _basename, _type, _dirpath, _req, _res) {
        super(_res);
        this.path = _path;
        this.safe_path = _safe_path; 
        this.basename = _basename;
        this.type = _type;
        this.dirpath = _dirpath;
        this.contents_root = path.join(__dirname, "contents")
        this.req = _req;
        this.res = _res;
    }

    setStructure(_structure_dir_path, _structure_file_path, _structure_type){
        this.structure_dir_path = _structure_dir_path;
        this.structure_file_path = _structure_file_path;
        this.structure_type = _structure_type;
    }

    log(){
        // console.log("\n--- Debug printing information reguarding file request: ---");
        console.log(super.color("gray", "this.path:\t"), this.path);
        console.log(super.color("gray", "this.safe_path:\t"), this.safe_path);
        console.log(super.color("gray", "this.basename:\t"), this.basename);
        console.log(super.color("gray", "this.type:\t"), this.type);
        console.log(super.color("gray", "this.dirpath:\t"), this.dirpath);
        console.log(super.color("gray", "this.contents_root:\t"), this.contents_root);
        console.log(super.color("gray", "this.reg & res:\t") + " Objects contaning req & res from http.createServer")
        console.log(super.color("gray", "this.warnings:\t") + " List<string> of warnings")
        console.log(super.color("gray", "this.errors:\t") + " List<string> of errors", "\n")
    }

    console_print_request_start(){
        console.log("\n\n--- Request START (" + this.basename + ") ---");
    }

    console_print_request_end(){
        console.log("--- Request END (" + this.basename + ") ---\n\n");
    }
}

let handlePath = ((req, res, _path) => {
    let fileMeta;
    {
        let safe_path = path.join(_path.replace(/^(\.\.)+/, '')); 
        let basename = path.basename(safe_path);
        let type = path.extname(safe_path);
        let dirpath = path.dirname(safe_path);
        fileMeta = new RequestedFile(_path, safe_path, basename, type, dirpath, req, res);
    }

    fileMeta.console_print_request_start();

    if (fileMeta.basename == "favicon.ico"){
        fileMeta.warnings.push("favicon.ico does not exist!");
        fileMeta.handle_warning_and_errors();
        fileMeta.console_print_request_end();
        return;
    }

    fileMeta.log();
    //let type = basename.match("\.([^\.]+)$")[1]; // First capture group
    console.log(req.url, fileMeta.safe_path, fileMeta.basename, fileMeta.dirpath, fileMeta.type);

    let stats;
    try {
        stats = fs.statSync(fileMeta.safe_path);
    } catch(e) {
        fileMeta.handle_error("Path does not exist '" + fileMeta.safe_path + "'");
        fileMeta.console_print_request_end();
        return;
    }

    if (stats.isFile(fileMeta.safe_path)){
        if (fileMeta.type != ".structure"){
            if (fileMeta.basename == "index.htm"){
                if (searchForStructure(fileMeta, fileMeta.dirpath) != true)
                    return;
                buildStructure(fileMeta, fileMeta.structure_dir_path, fileMeta.structure_type).then(() => {
                    fileMeta.handle_warning_and_errors();
                    fileMeta.console_print_request_end();
                    res.end();
                });
            }
            else {
                res.write(fs.readFileSync(fileMeta.safe_path));
                fileMeta.handle_warning_and_errors();
                fileMeta.console_print_request_end();
                res.end();
                return;
            }
        }
    }
});

let searchForStructure = ((fileMeta, currentDir, isFirstDir = true) => {
    let filename = "inherited.structure";
    if (isFirstDir)
        filename = "local.structure";

    let stats;
    try {
        console.log("PATH: " + path.join(currentDir, filename));
        stats = fs.statSync(path.join(currentDir, filename)); // Throws error if file does not exist
        console.log("Stats: ", stats);
    } catch(e) {
        console.log("Structure file does not exist. '" + fileMeta.dirpath + fileMeta.path.sep + filename + "'");
        let parentDir = path.resolve(currentDir, "../");
        if (__dirname == parentDir){
            fileMeta.warnings.push("Could not find structure for requested url! (reached project root directory!)");
            fileMeta.handle_warning_and_errors();
            fileMeta.console_print_request_end();
            return;
        }
        console.log("Searching for structure...");
        console.log("Parent Dir: ", parentDir);
        if (fileMeta.dirpath == path.join(__dirname, "contents")){
            fileMeta.handle_error("Structure file not found for current HTML file. (recurvsive)");
            fileMeta.console_print_request_end();
            return;
        }

        return searchForStructure(fileMeta, parentDir, false);
    }

    fileMeta.setStructure(currentDir, path.join(currentDir, filename), filename);
    return true;
});

let buildStructure = ((fileMeta, structurePath, structureType) => {
    return new Promise((resolve, reject) => {
        console.log(structurePath, structureType);
        let lineReader = require('readline').createInterface({
            input: require('fs').createReadStream(path.join(structurePath, structureType))
        });
        console.log(path.join(structurePath, structureType));

        let file_data_string = "";
    
        let promise = null;
        let handleTagLine = ((matches) => {
            lineReader.pause();
    
            let tagName = matches[1];
            let tagData = matches[2];
    
            if (tagName == "THIS_STRUCTURE"){
                promise = new Promise((resolve, reject) => {
                    return buildStructure(fileMeta, structurePath, "local.structure").then(() => resolve());
                });
            }
            else if (tagName == "FILE"){
                let _path;
                if (tagData.startsWith("/")){
                    _path = path.join(fileMeta.contents_root, tagData.substring(1)); // .structure files are server side and therfor trusted. May contain '..'
                }
                else{
                    _path = path.join(structurePath, tagData);
                }

                send_file(fileMeta, _path, tagName);
            }
            else if (tagName == "FILE_LOCAL_IF_INHERIT"){
                send_file(fileMeta, path.join(fileMeta.dirpath, tagData), tagName);
            }
            else if (tagName == "MAIN"){
                send_file(fileMeta, fileMeta.safe_path, tagName);
            }
            else{
                console.log(matches);
            }
            /*
            let filePath = tagLine.substring(tagLength);
            let extension = filePath.split(/\.+/).pop();
            let data;
    
            if (this.structure_type == "")
            ;
    
            if (fs.existsSync('content/'+filePath))
                data = fs.readFileSync('content/'+filePath, { encoding: 'utf8', flag: 'r' });
            else {
                res.write("alert(\"filePath: "+filePath+" not found!\");<script>alert(\"filePath: "+filePath+" not found!\");</script>");
                console.log("File: '" + filePath + "' does not exist!");
            }
            console.log("Finished reading data! "+ filePath);
            res.write("\n" + commentStart(extension) + " " + filePath + " " + commentEnd(extension) + "\n");
            res.write(data);
            res.write("\n" + commentStart(extension) + " " + filePath + " END " + commentEnd(extension) + "\n");
            */
            lineReader.resume();
        });

        let send_file = ((fileMeta, _path, tagName) => {
            console.log("$$$$$$$$$$$$$$$$$$$$$$$$$$    :", path.sep);
            console.log(_path);
            console.log(_path.split(path.sep).pop());
            if (/^[a-zA-Z0-9_æøåÆØÅ]*$/.test(_path.split(path.sep).pop())){ // If it does not conatin '.'
                console.log("___________________________");
                console.log(_path);
                send_file(fileMeta, _path + ".htm", tagName);
                send_file(fileMeta, _path + ".css", tagName);
                return;
            }
            let stats;
            let path_found = true;
            try {
                stats = fs.statSync(_path);
            } catch(e) {
                path_found = false;
                fileMeta.warnings.push("Path does not exist (for [" + tagName + "] in structure '" + path.join(structurePath, structureType) + "')\n- File not found: '" + _path + "'\n");
            }
        
            if (path_found == true && stats.isFile(_path)){
                console.log("PPPPPPPPPP: '", _path, "'");
                console.log(_path);
                if (_path.endsWith(".css")){
                    if (file_data_string.includes("</head>")) {
                        let css_path = _path;
                        css_path = css_path.substring(fileMeta.contents_root.length);
                        css_path = css_path.replaceAll(path.sep, path.posix.sep);
                        console.log("HHHHHHHHHHHHHHHH: ", css_path.substring(fileMeta.contents_root));
                        file_data_string = file_data_string.replace("</head>", "<link rel='stylesheet' href=\"" + css_path + "\"></head>");
                    }
                    else {
                        file_data_string += "<style>" + fs.readFileSync(_path, 'utf8') + "</style>";
                    }
                }
                else {
                    file_data_string += fs.readFileSync(_path, 'utf8');
                }
            }
        });
        
        lineReader.on('line', (line) => {
            console.log(line);
            if (line.startsWith("[")){
                let matches = line.match(/^\[([A-Z_]+)\](.*)$/);
                if (matches != null){
                    handleTagLine(matches);
                    //return;
                }
            }
            console.log(line);
        });

        let beforeClose = (() => {
            file_data_string = file_data_string.replace("<head>", "<head>\n\t<style>.file-" + fileMeta.dirpath.split(path.sep).pop() + "-" + fileMeta.basename.substring(0, (fileMeta.basename.length - fileMeta.type.length)) + "{ display:block; }</style>");
            fileMeta.res.write(file_data_string);
        });
    
        lineReader.on('close', () => {
            console.log("End sending this file");
            if (promise == null){
                console.log("Promise is NULL");
                beforeClose();
                resolve();
            }
            else {
                console.log("Waiting for other promise...");
                promise.then(() => {
                    console.log("Promise is __NOT__ NULL - DONE");
                    beforeClose();
                    resolve();
                }).catch((err) => {
                    reject(err);
                });
            }
        });
    });
});

let commentStart = ((type) => {
    if (type == "js" || type == "css")
        return "/***";
    if (type == "htm" || type == "html")
        return "<!--";
});

let commentEnd = ((type) => {
    if (type == "js" || type == "css")
        return "***/";
    if (type == "htm" || type == "html")
        return "-->";
});

server = http.createServer(listener);
server.listen(1337);