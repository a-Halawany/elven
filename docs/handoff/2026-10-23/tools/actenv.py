import re,shlex,sys
for f in sys.argv[1:]:
    for l in open(f):
        m=re.match(r'^  (EYE_B[0-9A-Z]+_[A-Z0-9_]+)=(.*)$', l.rstrip('\n'))
        if not m: continue
        v=m.group(2)
        if len(v)>=2 and v[0]==v[-1] and v[0] in "'\"": v=v[1:-1]
        print(f"export {m.group(1)}={shlex.quote(v)}")
