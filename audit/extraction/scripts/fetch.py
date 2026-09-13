import subprocess, hashlib, sys, os
S = sys.argv[1]
H = "07edd9dcd57e972203fb9e7bbcdab3a398c642b5"
files = [
 ("v00","docx","docs/The_Eye_Volume_0_Product_Constitution_v1.0 elvin.docx","f079067067d9db0bdf389b0f4a32fcbad15af44f",88681),
 ("v01","docx","docs/The_Eye_Volume_1_Executive_Vision_Book_v1.0 elvin.docx","cb6de42bbb4c82491632934d74435d6c7f6bf011",609027),
 ("v02","pdf","docs/The_Eye_Volume_2_Technical_Presentation_v1.1 elvin.pdf","62925dd018a9006a476da7cc0d2a0daf87eb1d2f",14213756),
 ("v03","pdf","docs/The_Eye_Volume_3_Technical_Architecture_v1.0 elvin.pdf","dab2408476ff2ddab85656ad586bad6414b49c66",3679286),
 ("v04","pdf","docs/The_Eye_Volume_4_Engineering_Specification_v1.0 elvin.pdf","08efeffbce4f901b05b1d5c9a13a58377b116c96",7185556),
 ("v05","pdf","docs/The_Eye_Volume_5_AI_Architecture_v1.0 elvin.pdf","cc97ed452c263adc1fa01028e67677d71efe61b1",10292126),
 ("v06","pdf","docs/The_Eye_Volume_6_Infrastructure_Architecture_v1.0 elvin .pdf","9a33d8221892792afffec3c719ae113359294155",11356353),
 ("v07","pdf","docs/The_Eye_Volume_7_Data_Platform_v1.0 elvin.pdf","81a6cc01958db0cebe823550cc0a62956f671b27",11299146),
 ("v08","pdf","docs/The_Eye_V8_PRD elvin.pdf","d1a704b1a041726fabaaa6d3b43888d57cd966b6",11875347),
 ("v09","pdf","docs/The_Eye_Volume_9_UI_UX_Design_System_v1.0 elvin .pdf","657c95092c1d00ad52965e9fc2d45d9075c8e244",12422483),
 ("v10","pdf","docs/The_Eye_Volume_10_Investor_Package_v1.0 elvin.pdf","152de5911d0e5c99e57cf94ef06e966dee6e7713",5491176),
]
ok = True
for tag, ext, path, blob, size in files:
    data = subprocess.run(["git","show",f"{H}:{path}"], capture_output=True, check=True).stdout
    sha = hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()
    good = (sha == blob and len(data) == size)
    ok &= good
    print(f"{tag} {'OK ' if good else 'BAD'} size={len(data)} (exp {size}) sha={sha} (exp {blob})")
    if good:
        open(os.path.join(S,"src",f"{tag}.{ext}"),"wb").write(data)
print("ALL OK" if ok else "VERIFICATION FAILURE")
