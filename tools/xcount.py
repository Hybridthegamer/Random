# Usage: python3 tools/xcount.py <<< "post text"   (prints X-weighted length; URLs=23, emoji=2)
import re,sys
def w(t):
    t=re.sub(r'https?://\S+','x'*23,t)
    t=t.replace('️','')
    n=0
    for c in t:
        o=ord(c)
        n+=1 if (o<=0x10FF or 0x2000<=o<=0x200D or 0x2010<=o<=0x201F or 0x2032<=o<=0x2037) else 2
    return n
print(w(sys.stdin.read().rstrip('\n')))
